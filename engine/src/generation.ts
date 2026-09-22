/**
 * Generation drives two numbers and nothing else: how much blood the body can
 * hold, and how fast it can draw on it in a single turn. The second one is the
 * rule tables forget.
 */

interface GenerationRow {
  bloodPoolMax: number;
  bloodPerTurn: number;
}

const GENERATION_TABLE: Record<number, GenerationRow> = {
  13: { bloodPoolMax: 10, bloodPerTurn: 1 },
  12: { bloodPoolMax: 11, bloodPerTurn: 1 },
  11: { bloodPoolMax: 12, bloodPerTurn: 1 },
  10: { bloodPoolMax: 13, bloodPerTurn: 1 },
  9: { bloodPoolMax: 14, bloodPerTurn: 2 },
  8: { bloodPoolMax: 15, bloodPerTurn: 3 },
  7: { bloodPoolMax: 20, bloodPerTurn: 4 },
  6: { bloodPoolMax: 30, bloodPerTurn: 6 },
  5: { bloodPoolMax: 40, bloodPerTurn: 8 },
  4: { bloodPoolMax: 50, bloodPerTurn: 10 },
};

export const LOWEST_GENERATION = 13;
export const HIGHEST_GENERATION = 4;

export function isValidGeneration(generation: number): boolean {
  return Number.isInteger(generation) && generation >= 4 && generation <= 13;
}

/**
 * Throws rather than clamping. A character document carrying generation 14 is
 * corrupt data, and a Function that quietly treats it as 13 hides the bug until
 * someone notices their blood pool is wrong three sessions later.
 */
export function generationLimits(generation: number): GenerationRow {
  const row = GENERATION_TABLE[generation];
  if (!row) {
    throw new RangeError(
      `generation ${generation} is outside the 4–13 range this engine models`,
    );
  }
  return { ...row };
}

export function bloodPoolMax(generation: number): number {
  return generationLimits(generation).bloodPoolMax;
}

export function bloodPerTurn(generation: number): number {
  return generationLimits(generation).bloodPerTurn;
}
