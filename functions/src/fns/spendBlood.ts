/**
 * Coterie — spendBlood
 *
 * Decrements the blood pool atomically, server-side, against both ceilings
 * generation sets: the pool itself and the per-turn draw. The per-turn cap is
 * scoped to the current scene's turn, so the Storyteller advancing the turn is
 * what resets it — no sweep, no broadcast.
 *
 * Refusals come back as 422 with copy the UI shows verbatim. Hitting zero sets
 * hungerFrenzy, which the UI turns into a frenzy prompt.
 *
 * Body: characterId, amount, reason
 */

import { spendBlood as spend, turnRef } from '../../../engine/src/index.ts';
import { loadCharacterFor, loadCurrentScene } from '../shared/auth.ts';
import { stateOf } from '../shared/codec.ts';
import { entry, int, optStr, refused, str, type Ctx } from '../shared/http.ts';
import { mutateCharacter } from '../shared/mutate.ts';

export async function handler(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  const amount = int(body, 'amount', 1, 10);
  const reason = optStr(body, 'reason', 120) ?? 'spent';
  const scene = await loadCurrentScene(ctx, access.chronicle);
  const ref = turnRef(scene ? { turnBase: scene.turnBase ?? 0, turn: scene.turn ?? 0 } : null);

  const { character, result } = await mutateCharacter(
    ctx,
    access.character.$id,
    'spendBlood',
    access.chronicle.teamId,
    (c) => {
      const out = spend(stateOf(c), amount, ref);
      if (!out.ok) throw refused(out.reason, out.message);
      return {
        patch: {
          bloodPool: out.bloodPool,
          bloodSpentThisTurn: out.bloodSpentThisTurn,
          bloodSpentTurnRef: out.bloodSpentTurnRef,
        },
        summary: `spent ${amount} blood (${reason}); ${out.bloodPool} left`,
        result: out,
      };
    },
  );

  return {
    bloodPool: character.bloodPool,
    bloodPoolMax: character.bloodPoolMax,
    spent: result.spent,
    remainingThisTurn: result.remainingThisTurn,
    hungerFrenzy: result.hungerFrenzy,
    version: character.version,
  };
}

export default entry('spendBlood', handler);
