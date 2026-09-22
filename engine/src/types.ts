/**
 * Coterie — V20 rules engine
 * Domain types. No framework, no Appwrite, no DOM. This package is the only
 * place in the codebase that knows how Vampire: The Masquerade 20th Anniversary
 * arithmetic works, and it is pure: same inputs, same outputs, every time.
 *
 * Game statistics only. No rulebook prose lives here — see the licensing note
 * in the build spec.
 */

export type DamageType = 'bashing' | 'lethal' | 'aggravated';

export type Outcome = 'success' | 'failure' | 'botch';

export type Visibility = 'table' | 'storyteller';

/**
 * Tables disagree about whether successes cancelled down to exactly zero is a
 * botch or an ordinary failure. The chronicle picks one at setup; the engine
 * never assumes.
 */
export type BotchRule = 'zero-with-a-one-is-a-botch' | 'only-negative-is-a-botch';

/** Injectable so tests are deterministic. Returns an integer in [1, 10]. */
export type DieSource = () => number;

export interface HealthTrack {
  bashing: number;
  lethal: number;
  aggravated: number;
}

/**
 * The slice of a character the engine needs. Deliberately narrow: a Function
 * reads these fields from the database and never takes them from the client.
 */
export interface CharacterState {
  generation: number;
  health: HealthTrack;
  bloodPool: number;
  willpowerTemporary: number;
  /** Blood already spent in the turn identified by bloodSpentTurnRef. */
  bloodSpentThisTurn: number;
  /** The scene turn that bloodSpentThisTurn counts against. */
  bloodSpentTurnRef: number;
}

export interface RolledDie {
  value: number;
  /** True when this die is itself the product of a specialty reroll. */
  rerolled: boolean;
  /** True when this die's 10 triggered a further die. */
  fromSpecialty: boolean;
}

export interface RollRequest {
  basePool: number;
  difficulty: number;
  /** Situational modifier from the Storyteller. Signed. */
  modifier?: number;
  /** Legal only at 4+ dots in the trait — the caller proves that, not us. */
  specialtyApplies?: boolean;
  spendWillpower?: boolean;
  botchRule?: BotchRule;
  label?: string;
  visibility?: Visibility;
}

export interface RollResult {
  label: string;
  difficulty: number;
  basePool: number;
  woundPenalty: number;
  modifier: number;
  /** base − woundPenalty + modifier, floored at zero. */
  pool: number;
  dice: RolledDie[];
  rawSuccesses: number;
  ones: number;
  netSuccesses: number;
  willpowerSpent: boolean;
  outcome: Outcome;
  botchRule: BotchRule;
  visibility: Visibility;
  /** Set when the pool collapsed to nothing or the character can't act. */
  refusal?: string;
}

export interface Refusal {
  ok: false;
  reason: string;
  /** Copy the UI shows verbatim. A refusal explains itself; it never no-ops. */
  message: string;
}

export type EngineResult<T> = ({ ok: true } & T) | Refusal;
