/**
 * Coterie — applyDamage
 *
 * Deltas, never absolutes. A player marking two and the Storyteller marking
 * three from the same attack is five boxes, whichever lands first, because
 * each call recomputes against the version that won the race (shared/mutate).
 *
 * A negative amount un-marks boxes — a correction, not healing — and is the
 * Storyteller's alone. Healing spends blood and goes through feedAndHeal.
 *
 * Body: characterId, amount (signed), type: bashing | lethal | aggravated
 */

import { applyDamage as apply, woundLevel, woundPenalty } from '../../../engine/src/index.ts';
import { loadCharacterFor } from '../shared/auth.ts';
import { healthOf, healthPatch } from '../shared/codec.ts';
import { entry, forbidden, int, oneOf, str, type Ctx } from '../shared/http.ts';
import { mutateCharacter } from '../shared/mutate.ts';

const TYPES = ['bashing', 'lethal', 'aggravated'] as const;

export async function handler(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  const amount = int(body, 'amount', -7, 7);
  const type = oneOf(body, 'type', TYPES);
  if (amount === 0) return { unchanged: true };
  if (amount < 0 && !access.asStoryteller) {
    throw forbidden('Only the Storyteller un-marks damage. Healing goes through feedAndHeal.');
  }

  const { character, result } = await mutateCharacter(
    ctx,
    access.character.$id,
    'applyDamage',
    access.chronicle.teamId,
    (c) => {
      const out = apply(healthOf(c), amount, type);
      return {
        patch: healthPatch(out.track),
        summary: `${amount > 0 ? '+' : ''}${amount} ${type}; now ${woundLevel(out.track) ?? 'unhurt'}`,
        result: out,
      };
    },
  );

  return {
    health: result.track,
    marked: result.marked,
    upgraded: result.upgraded,
    discarded: result.discarded,
    woundLevel: woundLevel(result.track) ?? null,
    woundPenalty: woundPenalty(result.track),
    incapacitated: result.incapacitated,
    newlyIncapacitated: result.newlyIncapacitated,
    version: character.version,
  };
}

export default entry('applyDamage', handler);
