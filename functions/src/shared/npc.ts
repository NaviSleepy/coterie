/**
 * The Storyteller's cast: NPCs with a stat block, kept behind the screen.
 * Only the Storyteller reads or writes them, and only through Functions, like
 * everything else with numbers on it.
 */

import { ABILITY_KEYS, ATTRIBUTE_KEYS, type HealthTrack, type TraitSheet } from '../../../engine/src/index.ts';
import { parseJson } from './codec.ts';
import type { Row } from './store.ts';
import { badRequest } from './http.ts';
import { dots, named, text, traitMap } from './sheet.ts';

export const NPC_KINDS = ['vampire', 'ghoul', 'mortal', 'other'] as const;

export interface Npc {
  $id: string;
  chronicleId: string;
  name: string;
  kind: (typeof NPC_KINDS)[number];
  clan: string;
  generation: number | null;
  attributes: Record<string, number>;
  abilities: Record<string, number>;
  disciplines: { name: string; level: number }[];
  willpower: number;
  willpowerMax: number;
  bloodPool: number;
  bloodPoolMax: number;
  healthBashing: number;
  healthLethal: number;
  healthAggravated: number;
  notes: string;
}

export function decodeNpc(row: Row): Npc {
  return {
    ...(row as any),
    attributes: parseJson(row.attributes, {}),
    abilities: parseJson(row.abilities, {}),
    disciplines: parseJson(row.disciplines, []),
  };
}

export function npcHealth(n: Pick<Npc, 'healthBashing' | 'healthLethal' | 'healthAggravated'>): HealthTrack {
  return { bashing: n.healthBashing ?? 0, lethal: n.healthLethal ?? 0, aggravated: n.healthAggravated ?? 0 };
}

/** Enough of a sheet for pool-building: NPCs have no virtues or specialties here. */
export function npcSheet(n: Npc): TraitSheet {
  return { attributes: n.attributes, abilities: n.abilities, virtues: {}, specialties: [], willpowerPermanent: n.willpowerMax };
}

type Rec = Record<string, unknown>;

/**
 * Validated column values. `partial` is an edit: only the fields sent change.
 * Creating fills the rest with an unremarkable mortal-ish baseline.
 */
export function validateNpc(input: Rec, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => !partial || input[k] !== undefined;

  if (has('name')) {
    const name = text(input.name, 120);
    if (!name) throw badRequest('An NPC needs a name.');
    out.name = name;
  }
  if (has('kind')) {
    const kind = input.kind ?? 'vampire';
    if (!(NPC_KINDS as readonly unknown[]).includes(kind)) throw badRequest(`kind must be one of ${NPC_KINDS.join(', ')}.`);
    out.kind = kind;
  }
  if (has('clan')) out.clan = text(input.clan, 60) ?? '';
  if (has('generation')) {
    out.generation = input.generation === null || input.generation === undefined ? null : dots(input.generation, 3, 15, 'generation');
  }
  if (has('attributes')) out.attributes = JSON.stringify(traitMap(input.attributes, ATTRIBUTE_KEYS, 1, 2, 'Attributes'));
  if (has('abilities')) out.abilities = JSON.stringify(traitMap(input.abilities, ABILITY_KEYS, 0, 0, 'Abilities'));
  if (has('disciplines')) out.disciplines = JSON.stringify(named(input.disciplines, 'Discipline', 'level', 10));
  if (has('willpowerMax')) out.willpowerMax = dots(input.willpowerMax ?? 3, 1, 10, 'willpowerMax');
  if (has('willpower')) out.willpower = dots(input.willpower ?? input.willpowerMax ?? 3, 0, 10, 'willpower');
  if (has('bloodPoolMax')) out.bloodPoolMax = dots(input.bloodPoolMax ?? 10, 0, 50, 'bloodPoolMax');
  if (has('bloodPool')) out.bloodPool = dots(input.bloodPool ?? 0, 0, 50, 'bloodPool');
  for (const k of ['healthBashing', 'healthLethal', 'healthAggravated'] as const) {
    if (has(k)) out[k] = dots(input[k] ?? 0, 0, 7, k);
  }
  if (has('notes')) out.notes = typeof input.notes === 'string' ? input.notes.slice(0, 4000) : '';
  return out;
}

/** The merged result must still make sense: pools within their maximums, at most seven wounds. */
export function checkNpc(n: Record<string, any>) {
  if (n.willpower > n.willpowerMax) throw badRequest('Willpower can’t be above its maximum.');
  if (n.bloodPool > n.bloodPoolMax) throw badRequest('Blood can’t be above the pool’s maximum.');
  if ((n.healthBashing ?? 0) + (n.healthLethal ?? 0) + (n.healthAggravated ?? 0) > 7) {
    throw badRequest('A health track holds seven wounds at most.');
  }
}
