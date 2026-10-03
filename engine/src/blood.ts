import type { CharacterState, EngineResult } from './types.ts';
import { bloodPerTurn, bloodPoolMax } from './generation.ts';
import { canSpendWillpower } from './traits.ts';

/**
 * How thin blood changes spending, from V20's Flaws. `reserve` is the bottom
 * of the pool that only keeps the vampire rising (2 at 14th Generation, 4 at
 * 15th): it can't pay for Disciplines, healing or raising Attributes.
 * `multiplier` is what one point of effect costs (2 at 15th, and with the
 * Thin Blood Flaw). Rising each night always costs one, whatever the rules.
 */
export interface BloodRules {
  reserve: number;
  multiplier: number;
}

export const NORMAL_BLOOD: BloodRules = { reserve: 0, multiplier: 1 };

export function bloodRules(c: { generation: number; template?: string | null; flaws?: { name: string }[] }): BloodRules {
  if (c.template === 'dhampir') return NORMAL_BLOOD;
  const thinFlaw = (c.flaws ?? []).some((f) => f.name.trim().toLowerCase() === 'thin blood');
  return {
    reserve: c.generation >= 15 ? 4 : c.generation === 14 ? 2 : 0,
    multiplier: c.generation >= 15 || thinFlaw ? 2 : 1,
  };
}

/** Points of effect the pool can still pay for under these rules. */
export function usableBlood(pool: number, rules: BloodRules): number {
  return Math.max(0, Math.floor((pool - rules.reserve) / rules.multiplier));
}

export interface SpendOutcome {
  bloodPool: number;
  spent: number;
  bloodSpentThisTurn: number;
  bloodSpentTurnRef: number;
  remainingThisTurn: number;
  /** The table will call for a hunger frenzy check. */
  hungerFrenzy: boolean;
}

/**
 * Decrements the pool against two ceilings derived from generation: how much
 * the body holds, and how fast it can draw. The per-turn cap needs the scene's
 * turn counter, which is why this takes the turn rather than trusting a
 * counter the client keeps.
 *
 * A refusal comes back as data with the copy attached. The UI explains it;
 * it never silently no-ops and leaves the player clicking a dead button.
 */
export function spendBlood(
  character: CharacterState,
  amount: number,
  sceneTurn: number,
  rules: BloodRules = NORMAL_BLOOD,
): EngineResult<SpendOutcome> {
  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      ok: false,
      reason: 'invalid-amount',
      message: 'Blood is spent in whole points, one or more at a time.',
    };
  }

  const perTurn = bloodPerTurn(character.generation);
  const alreadySpent = spentThisTurn(character, sceneTurn);
  const remaining = perTurn - alreadySpent;

  if (remaining <= 0) {
    return {
      ok: false,
      reason: 'per-turn-cap',
      message: `${alreadySpent} of ${perTurn} blood already spent this turn. Your generation can't draw faster — the cap resets when the Storyteller advances the turn.`,
    };
  }

  if (amount > remaining) {
    return {
      ok: false,
      reason: 'per-turn-cap',
      message: `Only ${remaining} of ${perTurn} blood left to draw this turn. The cap resets when the Storyteller advances the turn.`,
    };
  }

  // The per-turn cap counts points of effect; thin blood pays more for each.
  const cost = amount * rules.multiplier;
  if (cost > character.bloodPool) {
    return {
      ok: false,
      reason: 'insufficient-blood',
      message: rules.multiplier > 1
        ? `${character.bloodPool} blood in the pool, and thin blood costs ${rules.multiplier} a point. There isn't ${cost} there to spend.`
        : `${character.bloodPool} blood in the pool. There isn't ${amount} there to spend.`,
    };
  }
  if (character.bloodPool - cost < rules.reserve) {
    return {
      ok: false,
      reason: 'thin-blood-reserve',
      message: `Thin blood: the last ${rules.reserve} points only keep you rising. ${usableBlood(character.bloodPool, rules)} point${usableBlood(character.bloodPool, rules) === 1 ? '' : 's'} of effect left to spend.`,
    };
  }

  const bloodPool = character.bloodPool - cost;
  const bloodSpentThisTurn = alreadySpent + amount;

  return {
    ok: true,
    bloodPool,
    spent: cost,
    bloodSpentThisTurn,
    bloodSpentTurnRef: sceneTurn,
    remainingThisTurn: perTurn - bloodSpentThisTurn,
    hungerFrenzy: bloodPool === 0,
  };
}

export interface FeedOutcome {
  bloodPool: number;
  gained: number;
  /** Blood that didn't fit. The vessel is drained either way. */
  overflow: number;
  bloodPoolMax: number;
}

/** Adds blood up to the generation ceiling. Overflow is reported, not hidden. */
export function feed(character: CharacterState, bloodGained: number): FeedOutcome {
  const max = bloodPoolMax(character.generation);
  const room = Math.max(0, max - character.bloodPool);
  const gained = Math.max(0, Math.min(bloodGained, room));
  return {
    bloodPool: character.bloodPool + gained,
    gained,
    overflow: Math.max(0, bloodGained - gained),
    bloodPoolMax: max,
  };
}

/**
 * The counter is scoped to a turn. When the Storyteller advances the scene, the
 * stored count is stale and reads as zero — no sweep job, no reset broadcast,
 * no window where two clients disagree about whose turn it is.
 */
export function spentThisTurn(character: CharacterState, sceneTurn: number): number {
  // Outside a scene there is no turn to accumulate against (turnRef is -1), so
  // the cap limits each expenditure on its own.
  if (sceneTurn < 0) return 0;
  return character.bloodSpentTurnRef === sceneTurn ? character.bloodSpentThisTurn : 0;
}

export function remainingThisTurn(character: CharacterState, sceneTurn: number): number {
  return bloodPerTurn(character.generation) - spentThisTurn(character, sceneTurn);
}

/** What reawakening the body costs: a Willpower point and five blood, never doubled. */
export const REAWAKEN_BLOOD = 5;

export interface ReawakenOutcome {
  bloodPool: number;
  willpowerTemporary: number;
  willpowerSpentTurnRef: number;
}

/**
 * Time of Thin Blood's "anomalous biological activity": a thin-blooded
 * vampire spends a Willpower point and five blood to reawaken some mortal
 * function for a night (digesting a meal, a heartbeat, the anatomy for a
 * child). The five aren't doubled, but they can't come out of the reserve.
 * It isn't a combat action, so the per-turn blood cap doesn't apply;
 * Willpower keeps its once-a-turn rule.
 */
export function reawakenBody(
  c: { generation: number; template?: string | null; bloodPool: number; willpowerTemporary: number; willpowerSpentTurnRef: number },
  rules: BloodRules,
  sceneTurn: number,
): EngineResult<ReawakenOutcome> {
  if (c.template === 'dhampir' || c.generation < 14) {
    return { ok: false, reason: 'not-thin-blooded', message: 'Only the thin-blooded (14th and 15th Generation) can reawaken the body.' };
  }
  const wp = canSpendWillpower(c.willpowerTemporary, c.willpowerSpentTurnRef, sceneTurn);
  if (!wp.ok) return { ok: false, reason: 'willpower', message: wp.message };
  if (c.bloodPool < REAWAKEN_BLOOD) {
    return { ok: false, reason: 'insufficient-blood', message: `Reawakening takes ${REAWAKEN_BLOOD} blood; there are ${c.bloodPool} in the pool.` };
  }
  if (c.bloodPool - REAWAKEN_BLOOD < rules.reserve) {
    return { ok: false, reason: 'thin-blood-reserve', message: `Reawakening takes ${REAWAKEN_BLOOD} blood, and the last ${rules.reserve} only keep you rising. Feed first.` };
  }
  return {
    ok: true,
    bloodPool: c.bloodPool - REAWAKEN_BLOOD,
    willpowerTemporary: c.willpowerTemporary - 1,
    willpowerSpentTurnRef: sceneTurn,
  };
}
