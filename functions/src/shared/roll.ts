/**
 * The roll pipeline shared by rollPool and virtueCheck, so the dice logic, the
 * difficulty seal and the two-row disclosure split each live in exactly one
 * place.
 */

import { ID } from 'node-appwrite';

import {
  canSpendWillpower,
  isIncapacitated,
  rollPool,
  turnRef,
  type RollResult,
  type Visibility,
} from '../../../engine/src/index.ts';
import { loadCurrentScene, type Access, type Chronicle } from './auth.ts';
import { healthOf, type CharacterPatch, type Character } from './codec.ts';
import { refused, type Ctx } from './http.ts';
import { mutateCharacter } from './mutate.ts';
import { npcHealth, type Npc } from './npc.ts';
import { storytellerOnly, tableReadable } from './perms.ts';

/** V20's standard difficulty when the Storyteller hasn't sealed another. */
export const DEFAULT_DIFFICULTY = 6;

export type RollKind = 'pool' | 'degeneration' | 'frenzy' | 'rotschreck';

export interface RollInput {
  kind: RollKind;
  basePool: number;
  label: string;
  specialtyApplies: boolean;
  modifier: number;
  /** Storyteller-supplied. When absent the sealed difficulty (or the default) applies. */
  difficulty?: number;
  spendWillpower: boolean;
  visibility: Visibility;
  note?: string;
  /** Consequences written in the same version as the roll — a Path drop, say. */
  after?: (result: RollResult, character: Character) => { patch: CharacterPatch; note?: string };
}

/** What the table sees. The difficulty is not a field on it at all. */
export interface PublicRoll {
  rollId: string;
  label: string;
  kind: RollKind;
  basePool: number;
  woundPenalty: number;
  modifier: number;
  pool: number;
  dice: RollResult['dice'];
  rawSuccesses: number;
  ones: number;
  netSuccesses: number;
  willpowerSpent: boolean;
  outcome: RollResult['outcome'];
  visibility: Visibility;
  refusal: string | null;
  note: string | null;
  /** Present only in the Storyteller's response. */
  difficulty?: number;
  difficultySource?: 'storyteller' | 'sealed' | 'default';
}

export async function executeRoll(ctx: Ctx, access: Access, input: RollInput): Promise<PublicRoll> {
  const { character, chronicle, asStoryteller } = access;
  const scene = await loadCurrentScene(ctx, chronicle);
  const ref = turnRef(scene ? { turnBase: scene.turnBase ?? 0, turn: scene.turn ?? 0 } : null);
  const profile = await ctx.store.find('profiles', character.$id);
  const rollId = ID.unique();

  const { result } = await mutateCharacter(ctx, character.$id, input.kind === 'pool' ? 'rollPool' : 'virtueCheck', chronicle.teamId, async (c) => {
    if (isIncapacitated(healthOf(c))) {
      throw refused('incapacitated', 'Incapacitated — the character cannot act.');
    }

    // The number comes from the Storyteller, one way or another. A player's
    // request never carries it; handlers only pass `difficulty` for the ST.
    let difficulty = input.difficulty;
    let source: PublicRoll['difficultySource'] = 'storyteller';
    let sealConsumed = false;
    if (difficulty === undefined) {
      const seal = await ctx.store.find('sealedDifficulties', c.$id);
      if (seal) {
        difficulty = seal.difficulty as number;
        source = 'sealed';
        sealConsumed = true;
      } else {
        difficulty = DEFAULT_DIFFICULTY;
        source = 'default';
      }
    }

    if (input.spendWillpower) {
      const can = canSpendWillpower(c.willpowerTemporary, c.willpowerSpentTurnRef, ref);
      if (!can.ok) throw refused('willpower', can.message);
    }

    const rolled = rollPool(
      {
        basePool: input.basePool,
        difficulty,
        modifier: input.modifier,
        specialtyApplies: input.specialtyApplies,
        spendWillpower: input.spendWillpower,
        botchRule: chronicle.botchRule,
        label: input.label,
        visibility: input.visibility,
      },
      { character: { health: healthOf(c), willpowerTemporary: c.willpowerTemporary }, die: ctx.die },
    );

    const patch: CharacterPatch = {};
    if (rolled.willpowerSpent) {
      patch.willpowerTemporary = c.willpowerTemporary - 1;
      patch.willpowerSpentTurnRef = ref;
    }
    if (sealConsumed) patch.difficultySealed = false;

    const notes = [input.note];
    if (input.after && !rolled.refusal) {
      const consequence = input.after(rolled, c);
      Object.assign(patch, consequence.patch);
      notes.push(consequence.note);
    }
    const note = notes.filter(Boolean).join(' — ') || null;

    const pub: PublicRoll = {
      rollId,
      label: rolled.label,
      kind: input.kind,
      basePool: rolled.basePool,
      woundPenalty: rolled.woundPenalty,
      modifier: rolled.modifier,
      pool: rolled.pool,
      dice: rolled.dice,
      rawSuccesses: rolled.rawSuccesses,
      ones: rolled.ones,
      netSuccesses: rolled.netSuccesses,
      willpowerSpent: rolled.willpowerSpent,
      outcome: rolled.outcome,
      visibility: input.visibility,
      refusal: rolled.refusal ?? null,
      note,
    };

    return {
      patch,
      summary: `${input.label}: ${rolled.outcome} (${rolled.netSuccesses} net)${rolled.willpowerSpent ? ', Willpower spent' : ''}`,
      stage: async (tx) => {
        // Nobody writes these rows afterwards but revealRoll. An append-only
        // log is only append-only if the permissions say so: no update, no
        // delete, for any role.
        await tx.create(
          'rolls',
          rollId,
          {
            chronicleId: chronicle.$id,
            characterId: c.$id,
            characterName: profile?.name ?? 'Unknown',
            rollerId: ctx.userId,
            sceneId: scene?.$id ?? null,
            turn: scene?.turn ?? 0,
            kind: input.kind,
            label: pub.label,
            basePool: pub.basePool,
            woundPenalty: pub.woundPenalty,
            modifier: pub.modifier,
            pool: pub.pool,
            dice: JSON.stringify(pub.dice),
            rawSuccesses: pub.rawSuccesses,
            ones: pub.ones,
            netSuccesses: pub.netSuccesses,
            willpowerSpent: pub.willpowerSpent,
            outcome: pub.outcome,
            visibility: pub.visibility,
            refusal: pub.refusal,
            note: pub.note,
          },
          input.visibility === 'table' ? tableReadable(chronicle.teamId) : storytellerOnly(chronicle.teamId),
        );
        await tx.create(
          'rollSecrets',
          rollId,
          { rollId, chronicleId: chronicle.$id, difficulty, revealed: false },
          storytellerOnly(chronicle.teamId),
        );
        if (sealConsumed) await tx.remove('sealedDifficulties', c.$id);
      },
      result: asStoryteller ? { ...pub, difficulty, difficultySource: source } : pub,
    };
  });

  return result;
}

/**
 * An NPC's roll: the Storyteller's, built from the NPC's stat block, wounds
 * applied. It lands in the same two rows as anyone's, named for the NPC and
 * behind the screen unless the Storyteller says otherwise. There is no ledger
 * for NPCs, so spending Willpower is a plain write in the same transaction.
 */
export async function executeNpcRoll(
  ctx: Ctx,
  chronicle: Chronicle,
  npc: Npc,
  input: Omit<RollInput, 'kind' | 'after' | 'note'>,
): Promise<PublicRoll & { difficulty: number }> {
  const scene = await loadCurrentScene(ctx, chronicle);
  const difficulty = input.difficulty ?? DEFAULT_DIFFICULTY;
  if (isIncapacitated(npcHealth(npc))) throw refused('incapacitated', `${npc.name} is incapacitated and cannot act.`);
  if (input.spendWillpower && npc.willpower < 1) throw refused('willpower', `${npc.name} has no Willpower left to spend.`);
  const rolled = rollPool(
    {
      basePool: input.basePool,
      difficulty,
      modifier: input.modifier,
      specialtyApplies: input.specialtyApplies,
      spendWillpower: input.spendWillpower,
      botchRule: chronicle.botchRule,
      label: input.label,
      visibility: input.visibility,
    },
    { character: { health: npcHealth(npc), willpowerTemporary: npc.willpower }, die: ctx.die },
  );
  const rollId = ID.unique();
  const pub: PublicRoll = {
    rollId,
    label: rolled.label,
    kind: 'pool',
    basePool: rolled.basePool,
    woundPenalty: rolled.woundPenalty,
    modifier: rolled.modifier,
    pool: rolled.pool,
    dice: rolled.dice,
    rawSuccesses: rolled.rawSuccesses,
    ones: rolled.ones,
    netSuccesses: rolled.netSuccesses,
    willpowerSpent: rolled.willpowerSpent,
    outcome: rolled.outcome,
    visibility: input.visibility,
    refusal: rolled.refusal ?? null,
    note: null,
  };
  await ctx.store.transaction(async (tx) => {
    await tx.create(
      'rolls',
      rollId,
      {
        chronicleId: chronicle.$id,
        characterId: null,
        characterName: npc.name,
        rollerId: ctx.userId,
        sceneId: scene?.$id ?? null,
        turn: scene?.turn ?? 0,
        kind: 'pool',
        label: pub.label,
        basePool: pub.basePool,
        woundPenalty: pub.woundPenalty,
        modifier: pub.modifier,
        pool: pub.pool,
        dice: JSON.stringify(pub.dice),
        rawSuccesses: pub.rawSuccesses,
        ones: pub.ones,
        netSuccesses: pub.netSuccesses,
        willpowerSpent: pub.willpowerSpent,
        outcome: pub.outcome,
        visibility: pub.visibility,
        refusal: pub.refusal,
        note: null,
      },
      input.visibility === 'table' ? tableReadable(chronicle.teamId) : storytellerOnly(chronicle.teamId),
    );
    await tx.create('rollSecrets', rollId, { rollId, chronicleId: chronicle.$id, difficulty, revealed: false }, storytellerOnly(chronicle.teamId));
    if (rolled.willpowerSpent) await tx.update('npcs', npc.$id, { willpower: npc.willpower - 1 });
  });
  ctx.log(`npc roll ${npc.$id}: ${pub.label} ${pub.outcome}`);
  return { ...pub, difficulty };
}
