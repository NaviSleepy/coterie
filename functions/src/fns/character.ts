/**
 * Coterie — character
 *
 *   create   A player (or the ST) at the table creates a sheet. The mechanical
 *            row and the cosmetic profile are written together. Starting blood
 *            is rolled here, on a server die, like everything else.
 *   adjust   Storyteller only. Absolute sets on mechanical fields — the escape
 *            hatch for XP spends, retcons and anything v1 doesn't model yet.
 *            Versioned through the ledger like every other write.
 *   propose  The owner drafts changes to their own traits. They land in the
 *            proposals row, which the owner and the Storyteller read live;
 *            the sheet itself doesn't move. Sent again on every edit.
 *   withdraw The owner drops their proposal.
 *   approve  Storyteller only. Applies the proposal through the ledger and
 *            deletes it in the same transaction. Names the revision it was
 *            shown, so a draft edited in the meantime is refused, not applied.
 *   reject   Storyteller only. Marks the proposal declined, with a note.
 *   delete   The owner or the Storyteller removes a character for good: the
 *            sheet, profile, open proposal, sealed difficulty and the seals
 *            on secrets about it, and its place in scenes. The rolls it made
 *            and its ledger stay as history, with a last ledger line saying
 *            who deleted it. Names the character, so a stray call can't.
 *            Its portrait file goes too.
 *   setPortrait  The owner points their character at a portrait they uploaded,
 *            or clears it (fileId null). A browser can only grant roles it
 *            holds, so the upload is readable by its owner alone; this adds
 *            the Storyteller's read (and delete, for when the character goes)
 *            with the server key, after checking the caller controls the file.
 *
 * Body (create):   chronicleId, profile: {name, concept?, nature?, demeanor?}, sheet: {...}
 * Body (adjust):   characterId, sheet: {...partial}
 * Body (propose):  characterId, sheet: {...partial, proposable traits only}
 * Body (withdraw): characterId
 * Body (approve):  characterId, revision
 * Body (reject):   characterId, note?
 * Body (delete):   characterId, name (the character's name, as a confirmation)
 * Body (setPortrait): characterId, fileId (or null to remove)
 *
 *   Creation is held to the V20 budget (engine creationCost) for players. A
 *   sheet over it, or breaking a creation rule, is refused with 409
 *   needs-approval; the player can send it as a request instead:
 *   requestCreation  Stores the sheet for the Storyteller. Up to three open.
 *   approveCreation  Storyteller only. Creates it exactly as sent, owned by the player.
 *   declineCreation  Storyteller only. Keeps the request, declined, with a note.
 *   withdrawCreation The player (or the Storyteller) drops a request.
 * Body (requestCreation):  same as create
 * Body (approveCreation, withdrawCreation): requestId
 * Body (declineCreation):  requestId, note?
 */

import { ID, Query } from 'node-appwrite';

import { bloodPoolMax, creationCost, describeCost } from '../../../engine/src/index.ts';
import { isStoryteller, loadCharacterFor, loadChronicle, requireMember, requireStoryteller, type Chronicle } from '../shared/auth.ts';
import { encodePatch, parseJson, type Character, type CharacterPatch } from '../shared/codec.ts';
import { badRequest, entry, forbidden, HttpError, int, notFound, oneOf, optStr, str, type Ctx, type FilesLike } from '../shared/http.ts';
import { ledgerId, mutateCharacter } from '../shared/mutate.ts';
import { characterPerms, portraitPerms, profilePerms, requestPerms, storytellerOnly, update, user } from '../shared/perms.ts';
import { PORTRAIT_TYPES, PORTRAITS_BUCKET_ID } from '../shared/schema.ts';
import { checkSpecialties, PROPOSABLE, validateSheet } from '../shared/sheet.ts';
import { isConflict, type Tx } from '../shared/store.ts';

function profileFields(input: any) {
  const t = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = t(input?.name, 120);
  if (!name) throw badRequest('A character needs a name.');
  return {
    name,
    concept: t(input?.concept, 160),
    nature: t(input?.nature, 60),
    demeanor: t(input?.demeanor, 60),
  };
}

type Sheet = Required<Pick<Character, 'generation' | 'attributes' | 'abilities' | 'specialties' | 'virtues' | 'willpowerPermanent'>> & Record<string, unknown>;

function creationSheet(input: unknown): Sheet {
  const sheet = validateSheet((input ?? {}) as Record<string, unknown>, false) as Sheet;
  checkSpecialties(sheet as any);
  return sheet;
}

/**
 * Writes a new character and its profile in one transaction, owned by
 * `ownerId`. `alsoStage` adds writes to the same transaction (an approved
 * request is deleted with it).
 */
async function insertCharacter(
  ctx: Ctx,
  chronicle: Chronicle,
  ownerId: string,
  profile: ReturnType<typeof profileFields>,
  sheet: Sheet,
  alsoStage?: (tx: Tx) => Promise<void>,
) {
  const characterId = ID.unique();
  // V20 starts a vampire's pool on a die roll; the server rolls it. A dhampir's
  // blood is made by their own living body, so they start full.
  const bloodPool = sheet.template === 'dhampir' ? (sheet.bloodPoolMax as number) : Math.min(ctx.die(), bloodPoolMax(sheet.generation));

  const row = {
    chronicleId: chronicle.$id,
    ownerId,
    ...encodePatch(sheet),
    willpowerTemporary: sheet.willpowerPermanent,
    willpowerSpentTurnRef: -1,
    bloodPool,
    bloodSpentThisTurn: 0,
    bloodSpentTurnRef: -1,
    healthBashing: 0,
    healthLethal: 0,
    healthAggravated: 0,
    experienceTotal: 0,
    experienceSpent: 0,
    difficultySealed: false,
    version: 0,
  };

  await ctx.store.transaction(async (tx) => {
    await tx.create('characters', characterId, row, characterPerms(chronicle.teamId, ownerId));
    await tx.create('profiles', characterId, { chronicleId: chronicle.$id, ...profile }, profilePerms(chronicle.teamId, ownerId));
    await alsoStage?.(tx);
  });

  return { characterId, bloodPool };
}

async function create(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  await requireMember(ctx, chronicle);

  const profile = profileFields(body.profile);
  const sheet = creationSheet(body.sheet);
  // A player's new character must fit the creation budget; one that doesn't
  // goes to the Storyteller as a request. The Storyteller's own DMPCs are theirs to judge.
  if (!isStoryteller(ctx, chronicle)) {
    const cost = creationCost(sheet, chronicle.creationRules);
    if (!cost.ok) {
      throw new HttpError(409, 'needs-approval', `This character needs the Storyteller's approval: ${describeCost(cost).join('; ')}.`);
    }
  }
  return insertCharacter(ctx, chronicle, ctx.userId, profile, sheet);
}

/** Pending requests a player may have open at one table. */
const MAX_OPEN_REQUESTS = 3;

async function requestCreation(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  await requireMember(ctx, chronicle);
  const profile = profileFields(body.profile);
  const sheet = creationSheet(body.sheet);
  const mine = await ctx.store.list('creationRequests', [Query.equal('chronicleId', chronicle.$id), Query.equal('ownerId', ctx.userId), Query.limit(10)]);
  if (mine.filter((r) => r.status !== 'declined').length >= MAX_OPEN_REQUESTS) {
    throw new HttpError(409, 'too-many-requests', 'You already have characters waiting for the Storyteller. Withdraw one first.');
  }
  const requestId = ID.unique();
  await ctx.store.create(
    'creationRequests',
    requestId,
    {
      chronicleId: chronicle.$id,
      ownerId: ctx.userId,
      profile: JSON.stringify(profile),
      sheet: JSON.stringify(sheet),
      cost: JSON.stringify(describeCost(creationCost(sheet, chronicle.creationRules))),
      status: 'pending',
      note: '',
    },
    requestPerms(chronicle.teamId, ctx.userId),
  );
  return { requestId };
}

async function loadRequest(ctx: Ctx, body: any) {
  const request = await ctx.store.find('creationRequests', str(body, 'requestId', 36));
  if (!request) throw notFound('Request');
  const chronicle = await loadChronicle(ctx, request.chronicleId);
  return { request, chronicle };
}

async function approveCreation(ctx: Ctx, body: any) {
  const { request, chronicle } = await loadRequest(ctx, body);
  requireStoryteller(ctx, chronicle);
  if (request.status !== 'pending') throw new HttpError(409, 'not-pending', 'That request was already declined.');
  // Validated again: the stored sheet is the player's, and rules can change.
  const profile = profileFields(parseJson(request.profile, {}));
  const sheet = creationSheet(parseJson(request.sheet, {}));
  const out = await insertCharacter(ctx, chronicle, request.ownerId, profile, sheet, (tx) => tx.remove('creationRequests', request.$id));
  return { ...out, ownerId: request.ownerId };
}

async function declineCreation(ctx: Ctx, body: any) {
  const { request, chronicle } = await loadRequest(ctx, body);
  requireStoryteller(ctx, chronicle);
  await ctx.store.update('creationRequests', request.$id, { status: 'declined', note: optStr(body, 'note', 280) ?? '' });
  return { requestId: request.$id };
}

async function withdrawCreation(ctx: Ctx, body: any) {
  const { request, chronicle } = await loadRequest(ctx, body);
  if (request.ownerId !== ctx.userId && !isStoryteller(ctx, chronicle)) throw forbidden('That request is not yours.');
  await ctx.store.remove('creationRequests', request.$id);
  return { requestId: request.$id };
}

/** Merges a validated patch onto the sheet, keeping the derived limits true. */
function settle(c: Character, patch: CharacterPatch): CharacterPatch {
  const merged = { ...c, ...patch };
  checkSpecialties(merged as any);
  // Generation can move the ceiling under the current pool.
  if (merged.bloodPool > merged.bloodPoolMax) patch.bloodPool = merged.bloodPoolMax;
  if (merged.willpowerTemporary > merged.willpowerPermanent) patch.willpowerTemporary = merged.willpowerPermanent;
  return patch;
}

async function adjust(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  requireStoryteller(ctx, access.chronicle);
  const patch = validateSheet(body.sheet ?? {}, true, access.character);
  if (Object.keys(patch).length === 0) throw badRequest('Nothing to adjust.');

  const { character } = await mutateCharacter(ctx, access.character.$id, 'adjust', access.chronicle.teamId, (c) => ({
    patch: settle(c, patch),
    summary: `adjusted ${Object.keys(patch).join(', ')}`,
    result: null,
  }));

  return { characterId: character.$id, version: character.version };
}

/** Only the fields that actually differ from the sheet. */
function changedFrom(c: Character, patch: CharacterPatch): CharacterPatch {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(value) !== JSON.stringify((c as any)[key])) out[key] = value;
  }
  return out as CharacterPatch;
}

function proposableOnly(sheet: unknown): Record<string, unknown> {
  const src = (sheet ?? {}) as Record<string, unknown>;
  if (typeof src !== 'object' || Array.isArray(src)) throw badRequest('sheet must be an object.');
  // A refusal, not a silent drop, so the attack specs can assert on it.
  const locked = Object.keys(src).find((k) => !(PROPOSABLE as readonly string[]).includes(k));
  if (locked) throw forbidden(`${locked} isn't yours to propose; it changes only through play.`);
  return src;
}

async function propose(ctx: Ctx, body: any) {
  const { character, chronicle } = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  if (character.ownerId !== ctx.userId) throw forbidden("Only a character's player proposes changes to it.");

  const input = proposableOnly(body.sheet);
  const patch = changedFrom(character, validateSheet(input, true, character));
  // Checked now so the player hears about it while editing, and again on approval.
  checkSpecialties({ ...character, ...patch } as any);

  const id = character.$id;
  if (Object.keys(patch).length === 0) {
    await ctx.store.remove('proposals', id).catch((e) => { if ((e as { code?: number }).code !== 404) throw e; });
    return { characterId: id, revision: 0, changes: [] };
  }

  const data = { sheet: JSON.stringify(patch), baseVersion: character.version, status: 'pending', note: '' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await ctx.store.find('proposals', id);
    try {
      if (existing) {
        const revision = (existing.revision ?? 1) + 1;
        await ctx.store.update('proposals', id, { ...data, revision });
        return { characterId: id, revision, changes: Object.keys(patch) };
      }
      await ctx.store.create(
        'proposals',
        id,
        { chronicleId: chronicle.$id, ownerId: character.ownerId, ...data, revision: 1 },
        characterPerms(chronicle.teamId, character.ownerId),
      );
      return { characterId: id, revision: 1, changes: Object.keys(patch) };
    } catch (e) {
      // Another tab created it first: go round and update it instead.
      if (!isConflict(e)) throw e;
    }
  }
  throw new HttpError(409, 'contended', 'Your draft is being saved from somewhere else too. Try again.');
}

async function withdraw(ctx: Ctx, body: any) {
  const { character } = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  if (character.ownerId !== ctx.userId) throw forbidden("Only a character's player withdraws its proposal.");
  await ctx.store.remove('proposals', character.$id).catch((e) => { if ((e as { code?: number }).code !== 404) throw e; });
  return { characterId: character.$id };
}

async function approve(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  requireStoryteller(ctx, access.chronicle);
  const revision = int(body, 'revision', 1, 1_000_000);
  const id = access.character.$id;

  const proposal = await ctx.store.find('proposals', id);
  if (!proposal) throw notFound('Proposal');
  if (proposal.revision !== revision) {
    throw new HttpError(409, 'stale-proposal', 'The player changed this proposal while you were reading it. Look again.');
  }
  // Re-validated from the stored draft, so the derived fields follow generation.
  const stored = parseJson<Record<string, unknown>>(proposal.sheet, {});
  const input = Object.fromEntries(Object.entries(stored).filter(([k]) => (PROPOSABLE as readonly string[]).includes(k)));

  const { character } = await mutateCharacter(ctx, id, 'approve', access.chronicle.teamId, (c) => {
    const patch = changedFrom(c, validateSheet(input, true, c));
    return {
      patch: settle(c, patch),
      summary: `approved the player's changes to ${Object.keys(patch).join(', ') || 'nothing (already applied)'}`,
      stage: (tx) => tx.remove('proposals', id),
      result: null,
    };
  });

  return { characterId: id, version: character.version };
}

async function reject(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  requireStoryteller(ctx, access.chronicle);
  const id = access.character.$id;
  if (!(await ctx.store.find('proposals', id))) throw notFound('Proposal');
  await ctx.store.update('proposals', id, { status: 'declined', note: optStr(body, 'note', 280) ?? '' });
  return { characterId: id };
}

async function deleteCharacter(ctx: Ctx, body: any) {
  const { character, chronicle } = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  const id = character.$id;
  const profile = await ctx.store.find('profiles', id);
  const name = String(profile?.name ?? '');
  if (str(body, 'name', 120).trim().toLowerCase() !== name.trim().toLowerCase()) {
    throw badRequest(`To delete this character, send its name: ${name}.`);
  }

  const byChronicle = [Query.equal('chronicleId', chronicle.$id), Query.limit(500)];
  const seals = (await ctx.store.list('seals', byChronicle)).filter((s) => s.subjectCharacterId === id);
  const scenes = (await ctx.store.list('scenes', byChronicle)).filter((sc) => {
    const entries = parseJson<{ characterId?: string }[]>(sc.initiative, []);
    return ((sc.participants as string[]) ?? []).includes(id) || entries.some((e) => e.characterId === id);
  });
  const proposal = await ctx.store.find('proposals', id);
  const sealed = await ctx.store.find('sealedDifficulties', id);
  const reckoning = await ctx.store.find('reckonings', id);
  const reckoningSeal = await ctx.store.find('reckoningSeals', id);
  const version = character.version + 1;

  try {
    await ctx.store.transaction(async (tx) => {
      // The ledger line takes the next version, so a write racing this one collides here.
      await tx.create(
        'ledger',
        ledgerId(id, version),
        {
          chronicleId: chronicle.$id,
          characterId: id,
          version,
          fn: 'delete',
          actorId: ctx.userId,
          summary: `deleted ${name || 'the character'}`.slice(0, 500),
          patch: '{}',
        },
        storytellerOnly(chronicle.teamId),
      );
      await tx.remove('characters', id);
      if (profile) await tx.remove('profiles', id);
      if (proposal) await tx.remove('proposals', id);
      if (sealed) await tx.remove('sealedDifficulties', id);
      if (reckoning) await tx.remove('reckonings', id);
      if (reckoningSeal) await tx.remove('reckoningSeals', id);
      for (const s of seals) await tx.remove('seals', s.$id);
      for (const sc of scenes) {
        const initiative = parseJson<{ characterId?: string }[]>(sc.initiative, []).filter((e) => e.characterId !== id);
        await tx.update('scenes', sc.$id, {
          participants: ((sc.participants as string[]) ?? []).filter((p) => p !== id),
          initiative: JSON.stringify(initiative),
        });
      }
    });
  } catch (e) {
    if (!isConflict(e)) throw e;
    throw new HttpError(409, 'contended', 'Someone changed this sheet just now. Nothing was deleted — try again.');
  }
  await dropPortrait(ctx, profile?.portrait);
  ctx.log(`delete ${id} v${version}: ${name}`);
  return { characterId: id, deleted: true };
}

function filesOf(ctx: Ctx): FilesLike {
  if (!ctx.files) throw new Error('Storage is not available to this Function.');
  return ctx.files;
}

/** Best effort: a file left behind costs storage, never access. */
async function dropPortrait(ctx: Ctx, fileId: unknown) {
  if (typeof fileId !== 'string' || !fileId || !ctx.files) return;
  await ctx.files.deleteFile({ bucketId: PORTRAITS_BUCKET_ID, fileId }).catch(() => {});
}

async function setPortrait(ctx: Ctx, body: any) {
  const { character, chronicle } = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  if (character.ownerId !== ctx.userId) throw forbidden('Only the character\'s own player sets its portrait.');
  const profile = await ctx.store.find('profiles', character.$id);
  if (!profile) throw notFound('Profile');
  const previous = profile.portrait as string | undefined;

  if (body.fileId === null) {
    await ctx.store.update('profiles', character.$id, { portrait: '' });
    await dropPortrait(ctx, previous);
    return { characterId: character.$id, portrait: null };
  }

  const fileId = str(body, 'fileId', 36);
  const files = filesOf(ctx);
  let file;
  try {
    file = await files.getFile({ bucketId: PORTRAITS_BUCKET_ID, fileId });
  } catch {
    throw notFound('Portrait');
  }
  // Only the uploader's browser could have written update("user:<them>") on it.
  if (!file.$permissions.includes(update(user(ctx.userId)))) throw forbidden('That portrait is not yours.');
  if (file.mimeType && !PORTRAIT_TYPES.includes(file.mimeType)) throw badRequest('Portraits must be JPEG, PNG, GIF or WebP.');

  await files.updateFile({ bucketId: PORTRAITS_BUCKET_ID, fileId, permissions: portraitPerms(chronicle.teamId, ctx.userId) });
  await ctx.store.update('profiles', character.$id, { portrait: fileId });
  if (previous && previous !== fileId) await dropPortrait(ctx, previous);
  return { characterId: character.$id, portrait: fileId };
}

export async function handler(ctx: Ctx, body: any) {
  const action = oneOf(body, 'action', ['create', 'adjust', 'propose', 'withdraw', 'approve', 'reject', 'delete', 'requestCreation', 'approveCreation', 'declineCreation', 'withdrawCreation', 'setPortrait'] as const);
  return { create, adjust, propose, withdraw, approve, reject, delete: deleteCharacter, requestCreation, approveCreation, declineCreation, withdrawCreation, setPortrait }[action](ctx, body);
}

export default entry('character', handler);
