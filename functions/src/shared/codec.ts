/**
 * Row ⇄ domain. Appwrite has no JSON column, so structured fields arrive as
 * strings; this file is the only place that parses them, and it parses
 * defensively — a malformed blob decodes to empty rather than taking a
 * Function down mid-session.
 */

import type { CharacterState, HealthTrack, Specialty, TraitSheet } from '../../../engine/src/index.ts';
import type { Row } from './store.ts';

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export interface Character {
  $id: string;
  chronicleId: string;
  ownerId: string;
  /** Unset on rows from before templates existed: read as 'vampire'. */
  template: 'vampire' | 'dhampir';
  dhampirConcept: string;
  clan: string;
  sect: string;
  /** Sect office (Prince, Bishop…), set only by the Storyteller. */
  title: string;
  sire: string;
  generation: number;
  attributes: Record<string, number>;
  abilities: Record<string, number>;
  specialties: Specialty[];
  disciplines: { name: string; level: number; notes?: string }[];
  backgrounds: { name: string; level: number }[];
  virtues: TraitSheet['virtues'];
  merits: { name: string; points: number }[];
  rituals: { name: string; level: number }[];
  flaws: { name: string; points: number }[];
  path: string;
  pathRating: number;
  willpowerPermanent: number;
  willpowerTemporary: number;
  willpowerSpentTurnRef: number;
  bloodPool: number;
  bloodPoolMax: number;
  bloodPerTurn: number;
  bloodSpentThisTurn: number;
  bloodSpentTurnRef: number;
  healthBashing: number;
  healthLethal: number;
  healthAggravated: number;
  experienceTotal: number;
  experienceSpent: number;
  difficultySealed: boolean;
  version: number;
}

const JSON_FIELDS = [
  'attributes',
  'abilities',
  'specialties',
  'disciplines',
  'backgrounds',
  'virtues',
  'merits',
  'rituals',
  'flaws',
] as const;

export function decodeCharacter(row: Row): Character {
  return {
    $id: row.$id,
    chronicleId: row.chronicleId,
    ownerId: row.ownerId,
    template: row.template === 'dhampir' ? 'dhampir' : 'vampire',
    dhampirConcept: row.dhampirConcept ?? '',
    clan: row.clan ?? '',
    sect: row.sect ?? '',
    title: row.title ?? '',
    sire: row.sire ?? '',
    generation: row.generation,
    attributes: parseJson(row.attributes, {}),
    abilities: parseJson(row.abilities, {}),
    specialties: parseJson(row.specialties, []),
    disciplines: parseJson(row.disciplines, []),
    backgrounds: parseJson(row.backgrounds, []),
    virtues: parseJson(row.virtues, {}),
    merits: parseJson(row.merits, []),
    rituals: parseJson(row.rituals, []),
    flaws: parseJson(row.flaws, []),
    path: row.path ?? 'Humanity',
    pathRating: row.pathRating ?? 7,
    willpowerPermanent: row.willpowerPermanent ?? 1,
    willpowerTemporary: row.willpowerTemporary ?? 0,
    willpowerSpentTurnRef: row.willpowerSpentTurnRef ?? -1,
    bloodPool: row.bloodPool ?? 0,
    bloodPoolMax: row.bloodPoolMax ?? 10,
    bloodPerTurn: row.bloodPerTurn ?? 1,
    bloodSpentThisTurn: row.bloodSpentThisTurn ?? 0,
    bloodSpentTurnRef: row.bloodSpentTurnRef ?? -1,
    healthBashing: row.healthBashing ?? 0,
    healthLethal: row.healthLethal ?? 0,
    healthAggravated: row.healthAggravated ?? 0,
    experienceTotal: row.experienceTotal ?? 0,
    experienceSpent: row.experienceSpent ?? 0,
    difficultySealed: row.difficultySealed === true,
    version: row.version ?? 0,
  };
}

export type CharacterPatch = Partial<Omit<Character, '$id' | 'chronicleId' | 'ownerId' | 'version'>>;

/** Domain patch → row data. JSON fields are re-stringified; the rest pass through. */
export function encodePatch(patch: CharacterPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = (JSON_FIELDS as readonly string[]).includes(key) ? JSON.stringify(value) : value;
  }
  return out;
}

export function healthOf(c: Pick<Character, 'healthBashing' | 'healthLethal' | 'healthAggravated'>): HealthTrack {
  return { bashing: c.healthBashing, lethal: c.healthLethal, aggravated: c.healthAggravated };
}

export function healthPatch(track: HealthTrack): CharacterPatch {
  return { healthBashing: track.bashing, healthLethal: track.lethal, healthAggravated: track.aggravated };
}

export function stateOf(c: Character): CharacterState {
  return {
    generation: c.generation,
    health: healthOf(c),
    bloodPool: c.bloodPool,
    willpowerTemporary: c.willpowerTemporary,
    bloodSpentThisTurn: c.bloodSpentThisTurn,
    bloodSpentTurnRef: c.bloodSpentTurnRef,
  };
}

export function sheetOf(c: Character): TraitSheet {
  return {
    attributes: c.attributes,
    abilities: c.abilities,
    virtues: c.virtues,
    specialties: c.specialties,
    willpowerPermanent: c.willpowerPermanent,
  };
}
