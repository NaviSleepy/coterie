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
 * With reawaken: true, a thin-blooded vampire instead spends a Willpower point
 * and five blood (never doubled, never from the reserve) to reawaken a mortal
 * function for the night, as Time of Thin Blood describes.
 *
 * Body: characterId, amount, reason   or   characterId, reawaken: true, reason
 */

import { bloodRules, reawakenBody, spendBlood as spend, turnRef } from '../../../engine/src/index.ts';
import { loadCharacterFor, loadCurrentScene } from '../shared/auth.ts';
import { stateOf } from '../shared/codec.ts';
import { entry, int, optStr, refused, str, type Ctx } from '../shared/http.ts';
import { mutateCharacter } from '../shared/mutate.ts';

export async function handler(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  if (body.reawaken === true) return reawaken(ctx, body);
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
      // Thin blood: a reserve that can't be spent, and double cost at 15th Generation or with the Thin Blood Flaw.
      const out = spend(stateOf(c), amount, ref, bloodRules(c));
      if (!out.ok) throw refused(out.reason, out.message);
      return {
        patch: {
          bloodPool: out.bloodPool,
          bloodSpentThisTurn: out.bloodSpentThisTurn,
          bloodSpentTurnRef: out.bloodSpentTurnRef,
        },
        summary: `spent ${out.spent} blood (${reason})${out.spent !== amount ? ` for ${amount} point${amount === 1 ? '' : 's'} of effect` : ''}; ${out.bloodPool} left`,
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

async function reawaken(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  const reason = optStr(body, 'reason', 120) ?? 'a mortal function';
  const scene = await loadCurrentScene(ctx, access.chronicle);
  const ref = turnRef(scene ? { turnBase: scene.turnBase ?? 0, turn: scene.turn ?? 0 } : null);
  const { character } = await mutateCharacter(ctx, access.character.$id, 'reawaken', access.chronicle.teamId, (c) => {
    const out = reawakenBody(c, bloodRules(c), ref);
    if (!out.ok) throw refused(out.reason, out.message);
    return {
      patch: { bloodPool: out.bloodPool, willpowerTemporary: out.willpowerTemporary, willpowerSpentTurnRef: out.willpowerSpentTurnRef },
      summary: `reawakened the body (${reason}): 5 blood and a Willpower; ${out.bloodPool} blood left`,
      result: out,
    };
  });
  return { bloodPool: character.bloodPool, willpowerTemporary: character.willpowerTemporary, version: character.version };
}

export default entry('spendBlood', handler);
