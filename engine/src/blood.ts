import type { CharacterState, EngineResult } from './types.ts';
import { bloodPerTurn, bloodPoolMax } from './generation.ts';

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

  if (amount > character.bloodPool) {
    return {
      ok: false,
      reason: 'insufficient-blood',
      message: `${character.bloodPool} blood in the pool. There isn't ${amount} there to spend.`,
    };
  }

  const bloodPool = character.bloodPool - amount;
  const bloodSpentThisTurn = alreadySpent + amount;

  return {
    ok: true,
    bloodPool,
    spent: amount,
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
  return character.bloodSpentTurnRef === sceneTurn ? character.bloodSpentThisTurn : 0;
}

export function remainingThisTurn(character: CharacterState, sceneTurn: number): number {
  return bloodPerTurn(character.generation) - spentThisTurn(character, sceneTurn);
}
