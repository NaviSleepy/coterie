/**
 * Coterie — feedAndHeal
 *
 * Adds blood up to the generation ceiling, then optionally turns blood into
 * healed boxes. Returns exactly what changed so the UI can narrate it —
 * "fed 4, one spilled; healed 1 lethal for 1 blood" — rather than sliding
 * numbers around silently.
 *
 * Who may do what:
 *   bloodGained     Storyteller only. Blood in the pool comes out of the story,
 *                   and the story is the Storyteller's.
 *   heal            Owner or Storyteller. Bashing and lethal cost one blood a
 *                   box and count against the per-turn draw like any spend.
 *   healAggravated  Storyteller only. Five blood a box and a day's rest, so it
 *                   is downtime rather than a turn action and the cap doesn't
 *                   apply.
 *
 * Body: characterId, bloodGained?, heal?, healAggravated?
 */

import {
  bloodRules,
  feed,
  healDamage,
  remainingThisTurn,
  usableBlood,
  turnRef,
  type HealthTrack,
} from '../../../engine/src/index.ts';
import { loadCharacterFor, loadCurrentScene } from '../shared/auth.ts';
import { healthOf, healthPatch, stateOf } from '../shared/codec.ts';
import { entry, forbidden, optInt, refused, str, type Ctx } from '../shared/http.ts';
import { mutateCharacter } from '../shared/mutate.ts';

export async function handler(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  const bloodGained = optInt(body, 'bloodGained', 0, 50) ?? 0;
  const heal = optInt(body, 'heal', 0, 7) ?? 0;
  const healAggravated = optInt(body, 'healAggravated', 0, 7) ?? 0;

  if (!access.asStoryteller && bloodGained > 0) throw forbidden('Only the Storyteller adds blood to the pool.');
  if (!access.asStoryteller && healAggravated > 0) throw forbidden('Aggravated healing is downtime, and the Storyteller\'s call.');
  if (bloodGained + heal + healAggravated === 0) return { unchanged: true };

  const scene = await loadCurrentScene(ctx, access.chronicle);
  const ref = turnRef(scene ? { turnBase: scene.turnBase ?? 0, turn: scene.turn ?? 0 } : null);

  const { character, result } = await mutateCharacter(
    ctx,
    access.character.$id,
    'feedAndHeal',
    access.chronicle.teamId,
    (c) => {
      const fed = feed(stateOf(c), bloodGained);
      let pool = fed.bloodPool;
      let track: HealthTrack = healthOf(c);
      const healed = { lethal: 0, bashing: 0, aggravated: 0 };
      let turnSpend = 0;

      // Thin blood heals from the usable part of the pool only, and at 15th
      // Generation (or with the Thin Blood Flaw) each point of healing costs two.
      const rules = bloodRules(c);
      if (heal > 0) {
        // Worst first: lethal is the one that kills.
        const usable = usableBlood(pool, rules);
        const budget = Math.min(usable, remainingThisTurn({ ...stateOf(c), bloodPool: pool }, ref));
        if (budget <= 0) {
          throw refused(
            pool <= 0 ? 'insufficient-blood' : usable <= 0 ? 'thin-blood-reserve' : 'per-turn-cap',
            pool <= 0
              ? 'No blood in the pool to heal with.'
              : usable <= 0
                ? `Thin blood: the last ${rules.reserve} points only keep you rising, and can't heal.`
                : 'No blood left to draw this turn. Healing waits for the Storyteller to advance the turn.',
          );
        }
        let wanted = heal;
        let spendable = budget;
        for (const type of ['lethal', 'bashing'] as const) {
          const out = healDamage(track, wanted, type, spendable);
          track = out.track;
          healed[type] = out.healed;
          wanted -= out.healed;
          spendable -= out.bloodSpent;
          turnSpend += out.bloodSpent;
        }
        pool -= turnSpend * rules.multiplier;
      }

      if (healAggravated > 0) {
        const out = healDamage(track, healAggravated, 'aggravated', usableBlood(pool, rules));
        track = out.track;
        healed.aggravated = out.healed;
        pool -= out.bloodSpent * rules.multiplier;
      }

      const aggBlood = healed.aggravated * 5 * rules.multiplier;
      const alreadyThisTurn = ref >= 0 && c.bloodSpentTurnRef === ref ? c.bloodSpentThisTurn : 0;
      return {
        patch: {
          bloodPool: pool,
          ...healthPatch(track),
          ...(turnSpend > 0 ? { bloodSpentThisTurn: alreadyThisTurn + turnSpend, bloodSpentTurnRef: ref } : {}),
        },
        summary: [
          fed.gained ? `fed ${fed.gained}${fed.overflow ? ` (${fed.overflow} spilled)` : ''}` : '',
          healed.lethal ? `healed ${healed.lethal} lethal` : '',
          healed.bashing ? `healed ${healed.bashing} bashing` : '',
          healed.aggravated ? `healed ${healed.aggravated} aggravated` : '',
        ]
          .filter(Boolean)
          .join('; ') || 'nothing to heal',
        result: {
          gained: fed.gained,
          overflow: fed.overflow,
          healed,
          bloodSpentHealing: turnSpend * rules.multiplier + aggBlood,
        },
      };
    },
  );

  return {
    ...result,
    bloodPool: character.bloodPool,
    bloodPoolMax: character.bloodPoolMax,
    health: healthOf(character),
    version: character.version,
  };
}

export default entry('feedAndHeal', handler);
