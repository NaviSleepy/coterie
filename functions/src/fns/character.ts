/**
 * Coterie — character
 *
 *   create   A player (or the ST) at the table creates a sheet. The mechanical
 *            row and the cosmetic profile are written together. Starting blood
 *            is rolled here, on a server die, like everything else.
 *   adjust   Storyteller only. Absolute sets on mechanical fields — the escape
 *            hatch for XP spends, retcons and anything v1 doesn't model yet.
 *            Versioned through the ledger like every other write.
 *
 * Body (create): chronicleId, profile: {name, concept?, nature?, demeanor?}, sheet: {...}
 * Body (adjust): characterId, sheet: {...partial}
 */

import { ID } from 'node-appwrite';

import { bloodPoolMax } from '../../../engine/src/index.ts';
import { loadCharacterFor, loadChronicle, requireMember, requireStoryteller } from '../shared/auth.ts';
import { encodePatch, type Character } from '../shared/codec.ts';
import { badRequest, entry, oneOf, str, type Ctx } from '../shared/http.ts';
import { mutateCharacter } from '../shared/mutate.ts';
import { characterPerms, profilePerms } from '../shared/perms.ts';
import { checkSpecialties, validateSheet } from '../shared/sheet.ts';

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

async function create(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  await requireMember(ctx, chronicle);

  const profile = profileFields(body.profile);
  const sheet = validateSheet(body.sheet ?? {}, false) as Required<Pick<Character, 'generation' | 'attributes' | 'abilities' | 'specialties' | 'virtues' | 'willpowerPermanent'>> & Record<string, unknown>;
  checkSpecialties(sheet as any);

  const characterId = ID.unique();
  // V20 starts a character's pool on a die roll. The server rolls it.
  const bloodPool = Math.min(ctx.die(), bloodPoolMax(sheet.generation));

  const row = {
    chronicleId: chronicle.$id,
    ownerId: ctx.userId,
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
    await tx.create('characters', characterId, row, characterPerms(chronicle.teamId, ctx.userId));
    await tx.create(
      'profiles',
      characterId,
      { chronicleId: chronicle.$id, ...profile },
      profilePerms(chronicle.teamId, ctx.userId),
    );
  });

  return { characterId, bloodPool };
}

async function adjust(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  requireStoryteller(ctx, access.chronicle);
  const patch = validateSheet(body.sheet ?? {}, true);
  if (Object.keys(patch).length === 0) throw badRequest('Nothing to adjust.');

  const { character } = await mutateCharacter(ctx, access.character.$id, 'adjust', access.chronicle.teamId, (c) => {
    const merged = { ...c, ...patch };
    checkSpecialties(merged as any);
    // Generation can move the ceiling under the current pool.
    if (merged.bloodPool > merged.bloodPoolMax) patch.bloodPool = merged.bloodPoolMax;
    if (merged.willpowerTemporary > merged.willpowerPermanent) patch.willpowerTemporary = merged.willpowerPermanent;
    return { patch, summary: `adjusted ${Object.keys(patch).join(', ')}`, result: null };
  });

  return { characterId: character.$id, version: character.version };
}

export async function handler(ctx: Ctx, body: any) {
  const action = oneOf(body, 'action', ['create', 'adjust'] as const);
  return action === 'create' ? create(ctx, body) : adjust(ctx, body);
}

export default entry('character', handler);
