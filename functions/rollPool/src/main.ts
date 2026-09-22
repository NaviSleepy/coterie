/**
 * Coterie — rollPool
 *
 * The client never rolls. It asks. This Function is the only writer of the
 * rolls and rollSecrets collections, and it reads the character's health,
 * Willpower and specialties out of the database rather than taking them from
 * the request, because a request is a thing a player can edit in devtools.
 *
 * Two documents come out of one roll, and that split is the whole design:
 *
 *   rolls        the dice, the label, the outcome  → readable by the table
 *   rollSecrets  the difficulty                    → readable by the ST alone
 *
 * Appwrite's permissions are document-level, not field-level, so a hidden
 * difficulty can't be expressed on the same row as the dice it applied to.
 * Moving the secret to its own row with its own permissions is the fix, and it
 * means a player's websocket is never delivered the number at all — not
 * delivered and filtered client-side, which is theatre, but never sent.
 */

import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';

import { redactForTable, rollPool } from '../../../engine/src/dice.ts';
import type { BotchRule, RollResult, Visibility } from '../../../engine/src/types.ts';

const DB = process.env.APPWRITE_DATABASE_ID!;
const COL = {
  chronicles: 'chronicles',
  characters: 'characters',
  scenes: 'scenes',
  rolls: 'rolls',
  rollSecrets: 'rollSecrets',
} as const;

/** How many times a stale compare-and-swap will retry before giving up. */
const CAS_ATTEMPTS = 4;

interface Payload {
  characterId: string;
  basePool: number;
  difficulty: number;
  label: string;
  modifier?: number;
  trait?: string;
  spendWillpower?: boolean;
  visibility?: Visibility;
}

export default async function main({ req, res, log, error }: any) {
  const userId: string | undefined = req.headers['x-appwrite-user-id'];
  if (!userId) return res.json({ error: 'unauthenticated' }, 401);

  let payload: Payload;
  try {
    payload = parsePayload(req.bodyJson ?? JSON.parse(req.body ?? '{}'));
  } catch (e: any) {
    return res.json({ error: 'bad-request', detail: e.message }, 400);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT!)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID!)
    .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY!);

  const db = new Databases(client);

  try {
    const character = await db.getDocument(DB, COL.characters, payload.characterId);
    const chronicle = await db.getDocument(DB, COL.chronicles, character.chronicleId);

    // Authorization is checked here, not inferred from the fact that the call
    // arrived. A player rolls their own sheet; the Storyteller rolls anything
    // in their chronicle.
    const isOwner = character.ownerId === userId;
    const isStoryteller = chronicle.storytellerId === userId;
    if (!isOwner && !isStoryteller) {
      return res.json({ error: 'forbidden' }, 403);
    }

    // Only the Storyteller may bury a roll behind the screen. A player asking
    // for visibility: 'storyteller' gets a table roll and no explanation.
    const visibility: Visibility =
      isStoryteller && payload.visibility === 'storyteller' ? 'storyteller' : 'table';

    const scene = chronicle.currentSceneId
      ? await db.getDocument(DB, COL.scenes, chronicle.currentSceneId)
      : null;

    const result = rollPool(
      {
        basePool: payload.basePool,
        difficulty: payload.difficulty,
        modifier: payload.modifier ?? 0,
        label: payload.label,
        specialtyApplies: hasSpecialty(character, payload.trait),
        spendWillpower: payload.spendWillpower === true,
        botchRule: (chronicle.botchRule as BotchRule) ?? undefined,
        visibility,
      },
      {
        character: {
          health: {
            bashing: character.healthBashing ?? 0,
            lethal: character.healthLethal ?? 0,
            aggravated: character.healthAggravated ?? 0,
          },
          willpowerTemporary: character.willpowerTemporary ?? 0,
        },
      },
    );

    const teamId: string = chronicle.teamId;

    // The dice. No difficulty on this document — see the header.
    const rollDoc = await db.createDocument(
      DB,
      COL.rolls,
      ID.unique(),
      {
        chronicleId: chronicle.$id,
        characterId: character.$id,
        sceneId: scene?.$id ?? null,
        turn: scene?.turn ?? 0,
        label: result.label,
        basePool: result.basePool,
        woundPenalty: result.woundPenalty,
        modifier: result.modifier,
        pool: result.pool,
        dice: result.dice.map((d) => JSON.stringify(d)),
        rawSuccesses: result.rawSuccesses,
        ones: result.ones,
        netSuccesses: result.netSuccesses,
        willpowerSpent: result.willpowerSpent,
        outcome: result.outcome,
        visibility,
        refusal: result.refusal ?? null,
        createdAt: new Date().toISOString(),
      },
      // Nobody writes this row. Ever. Not the owner, not the Storyteller —
      // an append-only log is only append-only if the schema says so.
      visibility === 'table'
        ? [Permission.read(Role.team(teamId))]
        : [Permission.read(Role.team(teamId, 'storyteller'))],
    );

    // The difficulty, sealed. Flips to table-readable when the ST breaks the seal.
    await db.createDocument(
      DB,
      COL.rollSecrets,
      ID.unique(),
      {
        rollId: rollDoc.$id,
        chronicleId: chronicle.$id,
        difficulty: result.difficulty,
        revealed: false,
      },
      [Permission.read(Role.team(teamId, 'storyteller'))],
    );

    if (result.willpowerSpent) {
      await compareAndSwap(db, character.$id, (doc) => ({
        willpowerTemporary: Math.max(0, (doc.willpowerTemporary ?? 0) - 1),
      }));
    }

    log(`${result.label} · ${result.outcome} · ${visibility}`);

    // The caller gets back what the table gets. The Storyteller's own client
    // picks the difficulty up off the rollSecrets channel a beat later.
    return res.json({ rollId: rollDoc.$id, roll: forCaller(result, isStoryteller) });
  } catch (e: any) {
    error(`rollPool failed: ${e.message}`);
    return res.json({ error: 'roll-failed' }, 500);
  }
}

function forCaller(result: RollResult, isStoryteller: boolean) {
  return isStoryteller ? result : redactForTable(result);
}

/**
 * Specialties are legal only at 4+ dots, and the Function proves that against
 * the sheet rather than believing a flag in the request.
 */
function hasSpecialty(character: any, trait?: string): boolean {
  if (!trait) return false;
  const specialties: { trait: string; text: string }[] = (character.specialties ?? []).map(
    (s: string | object) => (typeof s === 'string' ? JSON.parse(s) : s),
  );
  if (!specialties.some((s) => s.trait === trait)) return false;

  const dots =
    character.attributes?.[trait] ?? character.abilities?.[trait] ?? 0;
  return dots >= 4;
}

/**
 * Appwrite has no conditional update, so this is read-modify-verify-retry: load
 * the document, compute the patch, write with an incremented version, and
 * re-read to confirm the version landed where we expected.
 *
 * Honest about what this is — it narrows the race rather than closing it. Two
 * Functions interleaving inside the confirm window can still both win. The
 * durable fix is a backend with real transactions, or routing every write to a
 * given character through a queue keyed on characterId. For a table of five
 * people clicking buttons a few times a minute, the retry loop is the right
 * amount of engineering; the note goes in the README so nobody thinks it was
 * missed rather than chosen.
 */
async function compareAndSwap(
  db: Databases,
  characterId: string,
  patch: (doc: any) => Record<string, unknown>,
): Promise<any> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const doc = await db.getDocument(DB, COL.characters, characterId);
    const expected = (doc.version ?? 0) + 1;

    const written = await db.updateDocument(DB, COL.characters, characterId, {
      ...patch(doc),
      version: expected,
    });

    if ((written.version ?? 0) === expected) return written;
  }
  throw new Error(`compare-and-swap exhausted ${CAS_ATTEMPTS} attempts on ${characterId}`);
}

function parsePayload(raw: any): Payload {
  const need = (k: string) => {
    if (raw[k] === undefined || raw[k] === null) throw new Error(`${k} is required`);
  };
  need('characterId');
  need('basePool');
  need('difficulty');
  need('label');

  const basePool = Number(raw.basePool);
  const difficulty = Number(raw.difficulty);
  if (!Number.isInteger(basePool) || basePool < 0 || basePool > 40) {
    throw new Error('basePool must be a whole number between 0 and 40');
  }
  if (!Number.isInteger(difficulty)) {
    throw new Error('difficulty must be a whole number');
  }

  return {
    characterId: String(raw.characterId),
    basePool,
    difficulty,
    label: String(raw.label).slice(0, 120),
    modifier: Number.isInteger(Number(raw.modifier)) ? Number(raw.modifier) : 0,
    trait: raw.trait ? String(raw.trait) : undefined,
    spendWillpower: raw.spendWillpower === true,
    visibility: raw.visibility === 'storyteller' ? 'storyteller' : 'table',
  };
}

export { compareAndSwap, hasSpecialty, parsePayload, Query };
