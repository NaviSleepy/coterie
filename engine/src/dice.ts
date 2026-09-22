import type {
  BotchRule,
  CharacterState,
  DieSource,
  Outcome,
  RollRequest,
  RollResult,
  RolledDie,
} from './types.ts';
import { isIncapacitated, woundPenalty } from './health.ts';

export const DEFAULT_BOTCH_RULE: BotchRule = 'zero-with-a-one-is-a-botch';

/**
 * A rerolled 10 rerolls again, cumulatively, so a pathological pool is a
 * geometric series that terminates with probability one — and "with probability
 * one" is not a thing to put in a Function with a timeout. Cap the chain.
 */
export const MAX_REROLL_DEPTH = 20;

/**
 * Unbiased d10 from the platform CSPRNG. Rejection sampling rather than a
 * modulo, because modulo bias on a 10-sided result from 256 values is real
 * (values 1–6 come up fractionally more often) and a dice roller that is
 * measurably crooked is worse than no dice roller.
 *
 * Present in Node 18+, Deno, Bun and every edge runtime, so the engine stays
 * portable — the same file runs in the Appwrite Function and in a test.
 */
export const cryptoDie: DieSource = () => {
  const bytes = new Uint8Array(1);
  const limit = 250; // 25 × 10, the largest multiple of 10 under 256
  for (;;) {
    crypto.getRandomValues(bytes);
    if (bytes[0] < limit) return (bytes[0] % 10) + 1;
  }
};

/**
 * Deterministic source for tests and for replaying a disputed roll. Cycles if
 * it runs dry rather than throwing, so a test that under-counts its dice fails
 * on the assertion instead of on an exception three frames deep.
 */
export function scriptedDice(values: number[]): DieSource {
  let i = 0;
  return () => values[i++ % values.length];
}

export interface RollContext {
  /** Read from the database by the Function. Never supplied by the client. */
  character: Pick<CharacterState, 'health' | 'willpowerTemporary'>;
  botchRule?: BotchRule;
  die?: DieSource;
}

/**
 * The one place dice exist. virtueCheck, frenzy, rötschreck and degeneration
 * all route through here so there is exactly one implementation of the V20
 * success arithmetic to get wrong.
 */
export function rollPool(request: RollRequest, context: RollContext): RollResult {
  const die = context.die ?? cryptoDie;
  const botchRule = request.botchRule ?? context.botchRule ?? DEFAULT_BOTCH_RULE;
  const modifier = request.modifier ?? 0;
  const difficulty = clampDifficulty(request.difficulty);
  const penalty = woundPenalty(context.character.health);
  const pool = Math.max(0, request.basePool - penalty + modifier);

  const shell: RollResult = {
    label: request.label ?? 'Unnamed roll',
    difficulty,
    basePool: request.basePool,
    woundPenalty: penalty,
    modifier,
    pool,
    dice: [],
    rawSuccesses: 0,
    ones: 0,
    netSuccesses: 0,
    willpowerSpent: false,
    outcome: 'failure',
    botchRule,
    visibility: request.visibility ?? 'table',
  };

  if (isIncapacitated(context.character.health)) {
    return { ...shell, pool: 0, refusal: 'Incapacitated — the character cannot act.' };
  }

  if (pool === 0) {
    return {
      ...shell,
      refusal:
        penalty > 0
          ? 'Wounds took the pool to nothing. Automatic failure — no dice are rolled.'
          : 'No dice in the pool. Automatic failure.',
    };
  }

  const dice = rollDice(pool, difficulty, die, request.specialtyApplies === true);

  const rawSuccesses = dice.filter((d) => d.value >= difficulty).length;
  // Ones subtract wherever they land, including on a specialty reroll. This is
  // the single biggest divergence from newer editions and the thing a naive
  // implementation gets wrong.
  const ones = dice.filter((d) => d.value === 1).length;
  let net = rawSuccesses - ones;

  let outcome = resolveOutcome(net, ones, botchRule);

  // Willpower buys one automatic success, added after the dice resolve. It
  // cannot turn a botch into anything — spend it and the botch still lands.
  const willpowerSpent =
    request.spendWillpower === true && context.character.willpowerTemporary > 0;
  if (willpowerSpent && outcome !== 'botch') {
    net += 1;
    outcome = net > 0 ? 'success' : outcome;
  }

  return {
    ...shell,
    dice,
    rawSuccesses,
    ones,
    netSuccesses: net,
    willpowerSpent,
    outcome,
  };
}

function rollDice(
  pool: number,
  difficulty: number,
  die: DieSource,
  specialtyApplies: boolean,
): RolledDie[] {
  const dice: RolledDie[] = [];
  const queue: { rerolled: boolean; depth: number }[] = [];

  for (let i = 0; i < pool; i++) queue.push({ rerolled: false, depth: 0 });

  while (queue.length > 0) {
    const slot = queue.shift()!;
    const value = die();
    const spawns = specialtyApplies && value === 10 && slot.depth < MAX_REROLL_DEPTH;
    dice.push({ value, rerolled: slot.rerolled, fromSpecialty: spawns });
    if (spawns) queue.push({ rerolled: true, depth: slot.depth + 1 });
  }

  return dice;
}

function resolveOutcome(net: number, ones: number, botchRule: BotchRule): Outcome {
  if (net < 0) return 'botch';
  if (net > 0) return 'success';
  if (ones === 0) return 'failure';
  return botchRule === 'zero-with-a-one-is-a-botch' ? 'botch' : 'failure';
}

function clampDifficulty(difficulty: number): number {
  if (!Number.isInteger(difficulty)) {
    throw new TypeError('difficulty must be a whole number');
  }
  return Math.min(10, Math.max(2, difficulty));
}

/**
 * What the table is allowed to see. The difficulty lives in its own collection
 * with its own permissions, so it is simply absent here rather than blanked —
 * a field the client never receives can't be leaked by a careless render.
 */
export function redactForTable(result: RollResult): Omit<RollResult, 'difficulty'> {
  const { difficulty: _difficulty, ...rest } = result;
  return rest;
}
