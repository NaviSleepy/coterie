/**
 * Coterie — virtueCheck
 *
 * One entry point for the three rolls that use Virtues rather than
 * Attribute + Ability. All three route through the same roll pipeline as
 * rollPool, so the dice arithmetic lives in exactly one place; what differs is
 * which Virtue is read and what is written afterwards.
 *
 *   degeneration  Conscience/Conviction, in three deliberate steps, because a
 *                 tool that makes this one click cheapens it:
 *                   action 'lay'      Storyteller only. Names the sin in their
 *                                     own words and seals a difficulty.
 *                   action 'face'     The character's own player (the default).
 *                                     Rolls against the sealed difficulty. A
 *                                     failure or botch drops the Path rating by
 *                                     one in the same committed version as the
 *                                     roll; the sin, the difficulty and the
 *                                     change go to the feed for the table.
 *                   action 'withdraw' Storyteller only, before it is faced.
 *   frenzy        Self-Control/Instinct against a provocation.
 *   rötschreck    Courage against fire or sunlight.
 *
 * Willpower cannot be spent on any of them.
 *
 * Body: characterId, kind, action (degeneration), sin + difficulty (lay),
 *       provocation, difficulty (ST only, frenzy and rötschreck)
 */

import { traitDots, traitLabel, virtueForCheck, type VirtueCheckKind } from '../../../engine/src/index.ts';
import { loadCharacterFor, type Access } from '../shared/auth.ts';
import { sheetOf } from '../shared/codec.ts';
import { entry, forbidden, int, oneOf, optInt, optStr, refused, str, type Ctx } from '../shared/http.ts';
import { characterPerms, storytellerOnly } from '../shared/perms.ts';
import { executeRoll, type PublicRoll } from '../shared/roll.ts';

const KINDS = ['degeneration', 'frenzy', 'rotschreck'] as const satisfies readonly VirtueCheckKind[];

const LABEL: Record<VirtueCheckKind, string> = {
  degeneration: 'Degeneration',
  frenzy: 'Frenzy',
  rotschreck: 'Rötschreck',
};

async function lay(ctx: Ctx, access: Access, body: any) {
  if (!access.asStoryteller) throw forbidden('Only the Storyteller names a sin.');
  const { character: c, chronicle } = access;
  const sin = str(body, 'sin', 280);
  const difficulty = int(body, 'difficulty', 2, 10);
  if (c.pathRating <= 0) throw refused('no-path', `${c.path} is already at zero.`);
  await ctx.store.transaction(async (tx) => {
    const existing = await ctx.store.find('reckonings', c.$id);
    if (existing) {
      await tx.update('reckonings', c.$id, { sin });
      await tx.update('reckoningSeals', c.$id, { difficulty });
    } else {
      await tx.create('reckonings', c.$id, { chronicleId: chronicle.$id, sin }, characterPerms(chronicle.teamId, c.ownerId));
      await tx.create('reckoningSeals', c.$id, { chronicleId: chronicle.$id, difficulty }, storytellerOnly(chronicle.teamId));
    }
  });
  return { characterId: c.$id, sin, difficulty };
}

async function withdraw(ctx: Ctx, access: Access) {
  if (!access.asStoryteller) throw forbidden('Only the Storyteller withdraws a sin.');
  const id = access.character.$id;
  if (!(await ctx.store.find('reckonings', id))) throw refused('no-reckoning', 'There is no sin waiting.');
  await ctx.store.transaction(async (tx) => {
    await tx.remove('reckonings', id);
    if (await ctx.store.find('reckoningSeals', id)) await tx.remove('reckoningSeals', id);
  });
  return { withdrawn: id };
}

async function face(ctx: Ctx, access: Access): Promise<PublicRoll> {
  const c = access.character;
  if (c.ownerId !== ctx.userId) throw forbidden("Only the character's own player faces it.");
  const reckoning = await ctx.store.find('reckonings', c.$id);
  const seal = await ctx.store.find('reckoningSeals', c.$id);
  if (!reckoning || !seal) throw refused('no-reckoning', 'There is no sin waiting to be faced.');
  const virtue = virtueForCheck(c.virtues, 'degeneration');

  return executeRoll(ctx, access, {
    kind: 'degeneration',
    basePool: traitDots(sheetOf(c), virtue),
    label: `${LABEL.degeneration} · ${traitLabel(virtue)}`,
    specialtyApplies: false,
    modifier: 0,
    difficulty: seal.difficulty as number,
    revealDifficulty: true,
    spendWillpower: false,
    visibility: 'table',
    note: reckoning.sin as string,
    // Faced once: a second press that lost the race finds nothing to roll.
    guard: async () => {
      if (!(await ctx.store.find('reckonings', c.$id))) throw refused('no-reckoning', 'That sin has already been faced.');
    },
    stageExtra: async (tx) => {
      await tx.remove('reckonings', c.$id);
      await tx.remove('reckoningSeals', c.$id);
    },
    after: (result, current) => {
      if (result.outcome === 'success') return { patch: {}, note: `${current.path} holds at ${current.pathRating}` };
      const pathRating = Math.max(0, current.pathRating - 1);
      return { patch: { pathRating }, note: `${current.path} falls to ${pathRating}` };
    },
  });
}

export async function handler(ctx: Ctx, body: any): Promise<any> {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  const kind = oneOf(body, 'kind', KINDS);

  if (kind === 'degeneration') {
    const action = body.action === undefined ? 'face' : oneOf(body, 'action', ['lay', 'face', 'withdraw'] as const);
    if (action === 'lay') return lay(ctx, access, body);
    if (action === 'withdraw') return withdraw(ctx, access);
    return face(ctx, access);
  }

  if (!access.asStoryteller && body.difficulty !== undefined) throw forbidden('Only the Storyteller sets difficulty.');
  const c = access.character;
  const virtue = virtueForCheck(c.virtues, kind);
  return executeRoll(ctx, access, {
    kind,
    basePool: traitDots(sheetOf(c), virtue),
    label: `${LABEL[kind]} · ${traitLabel(virtue)}`,
    specialtyApplies: false,
    modifier: 0,
    difficulty: access.asStoryteller ? optInt(body, 'difficulty', 2, 10) : undefined,
    spendWillpower: false,
    visibility: 'table',
    note: optStr(body, 'provocation', 280),
  });
}

export default entry('virtueCheck', handler);
