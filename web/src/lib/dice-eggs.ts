/**
 * Small surprises in the dice. Pure: a roll in, at most one egg out, so the
 * feed can show it and the tests can pin exactly when each one hatches.
 */

export interface RollLike {
  dice: { value: number }[];
  outcome: string;
  netSuccesses: number;
  refusal?: string | null;
}

export type Egg =
  | { kind: 'purr'; line: string } // every die a 10
  | { kind: 'dark'; line: string } // a botch where every die is a 1
  | { kind: 'thirteen'; line: string }; // exactly thirteen successes

export function eggOf(r: RollLike): Egg | null {
  if (r.refusal || !r.dice.length) return null;
  const values = r.dice.map((d) => d.value);
  if (values.length >= 3 && values.every((v) => v === 10)) return { kind: 'purr', line: 'The Beast purrs.' };
  if (values.length >= 2 && r.outcome === 'botch' && values.every((v) => v === 1)) {
    return { kind: 'dark', line: 'Someone cut the lights.' };
  }
  if (r.netSuccesses === 13) return { kind: 'thirteen', line: 'It was always going to be thirteen.' };
  return null;
}
