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
  // The thin-blooded (V20's Fourteenth and Fifteenth Generation Flaws): a pool of 10, of which less is usable.
  15: { bloodPoolMax: 10, bloodPerTurn: 1 },
  14: { bloodPoolMax: 10, bloodPerTurn: 1 },
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

/** The highest Generation the Generation Background buys down from: 13th is zero dots. */
export const LOWEST_GENERATION = 13;
export const HIGHEST_GENERATION = 4;
/** The thinnest blood that still makes a vampire. */
export const THINNEST_GENERATION = 15;

/** 14th and 15th Generation: the thin-blooded. */
export function isThinBlooded(generation: number): boolean {
  return generation >= 14;
}

/** The highest Discipline rating a Generation allows: 4 at 14th, 3 at 15th, otherwise no limit here. */
export function disciplineCap(generation: number): number | null {
  return generation >= 15 ? 3 : generation === 14 ? 4 : null;
}

export function isValidGeneration(generation: number): boolean {
  return Number.isInteger(generation) && generation >= HIGHEST_GENERATION && generation <= THINNEST_GENERATION;
}

/**
 * Throws rather than clamping. A character document carrying generation 16 is
 * corrupt data, and a Function that quietly treats it as 13 hides the bug until
 * someone notices their blood pool is wrong three sessions later.
 */
export function generationLimits(generation: number): GenerationRow {
  const row = GENERATION_TABLE[generation];
  if (!row) {
    throw new RangeError(
      `generation ${generation} is outside the 4–15 range this engine models`,
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
