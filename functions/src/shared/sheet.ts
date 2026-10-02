/**
 * Sheet validation for character creation and Storyteller adjustment. Ranges
 * are V20's; anything outside them is refused rather than clamped, so a bad
 * request fails loudly instead of writing something nobody asked for.
 */

import {
  ABILITY_KEYS,
  ATTRIBUTE_KEYS,
  VIRTUES,
  bloodPerTurn,
  bloodPoolMax,
  isValidGeneration,
  traitDots,
  traitKind,
} from '../../../engine/src/index.ts';
import type { CharacterPatch } from './codec.ts';
import { badRequest } from './http.ts';

type Rec = Record<string, unknown>;

export function dots(value: unknown, min: number, max: number, what: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw badRequest(`${what} must be ${min}–${max}.`);
  }
  return value as number;
}

export function traitMap(input: unknown, keys: readonly string[], min: number, dflt: number, what: string) {
  const src = (input ?? {}) as Rec;
  if (typeof src !== 'object' || Array.isArray(src)) throw badRequest(`${what} must be an object.`);
  const unknown = Object.keys(src).find((k) => !keys.includes(k));
  if (unknown) throw badRequest(`Unknown ${what.toLowerCase()}: ${unknown}.`);
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = src[key] === undefined ? dflt : dots(src[key], min, 5, key);
  return out;
}

// Merits and flaws are both written as positive points (1–7): a merit's cost,
// a flaw's refund. The sign lives in which list an entry is in.
export function named(input: unknown, what: string, levelKey: 'level' | 'points', max: number) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 40) throw badRequest(`${what} must be a list.`);
  return input.map((item: any) => {
    if (typeof item?.name !== 'string' || !item.name.trim()) throw badRequest(`Every ${what.toLowerCase()} needs a name.`);
    const entry: any = { name: item.name.trim().slice(0, 60) };
    entry[levelKey] = dots(item[levelKey] ?? 1, levelKey === 'points' ? 1 : 0, max, `${entry.name}`);
    if (typeof item.notes === 'string') entry.notes = item.notes.slice(0, 500);
    return entry;
  });
}

export function text(input: unknown, max: number): string | undefined {
  return typeof input === 'string' ? input.trim().slice(0, max) : undefined;
}

/**
 * `partial` is the Storyteller's adjust: only the fields present are
 * validated and returned. Creation validates everything and fills defaults.
 */
export const TEMPLATES = ['vampire', 'dhampir'] as const;
export type Template = (typeof TEMPLATES)[number];

/**
 * A dhampir's blood doesn't follow Generation: a pool of 10 (Antiquity raises
 * it, through the Storyteller's adjust) and one point a turn.
 */
export const DHAMPIR_POOL = 10;

export function validateSheet(
  input: Rec,
  partial: boolean,
  current?: { template?: string | null; generation?: number },
): CharacterPatch {
  const patch: CharacterPatch = {};
  const has = (k: string) => !partial || input[k] !== undefined;

  if (has('template')) {
    const t = input.template ?? 'vampire';
    if (!(TEMPLATES as readonly unknown[]).includes(t)) throw badRequest(`template must be one of ${TEMPLATES.join(', ')}.`);
    patch.template = t as Template;
  }
  const template: Template = patch.template ?? (current?.template === 'dhampir' ? 'dhampir' : 'vampire');
  if (has('dhampirConcept')) patch.dhampirConcept = text(input.dhampirConcept, 60) ?? '';

  if (has('clan')) patch.clan = text(input.clan, 60) ?? '';
  if (has('sect')) patch.sect = text(input.sect, 60) ?? '';
  // A sect office is awarded, not chosen: only the Storyteller's adjust sets it.
  if (partial && input.title !== undefined) patch.title = text(input.title, 80) ?? '';
  if (has('sire')) patch.sire = text(input.sire, 120) ?? '';
  if (has('path')) patch.path = text(input.path, 80) || 'Humanity';

  if (has('generation')) {
    const g = input.generation ?? 13;
    if (!isValidGeneration(g as number)) throw badRequest('generation must be 4–13.');
    patch.generation = g as number;
    if (template === 'vampire') {
      patch.bloodPoolMax = bloodPoolMax(g as number);
      patch.bloodPerTurn = bloodPerTurn(g as number);
    }
  }
  // Switching template resets the pool to that template's rule.
  if (patch.template === 'dhampir' && (!partial || current?.template !== 'dhampir')) {
    patch.bloodPoolMax = DHAMPIR_POOL;
    patch.bloodPerTurn = 1;
  } else if (patch.template === 'vampire' && partial && current?.template === 'dhampir') {
    const g = patch.generation ?? current.generation ?? 13;
    patch.bloodPoolMax = bloodPoolMax(g);
    patch.bloodPerTurn = bloodPerTurn(g);
  }
  if (partial && input.bloodPoolMax !== undefined) patch.bloodPoolMax = dots(input.bloodPoolMax, 1, 50, 'bloodPoolMax');
  if (has('attributes')) patch.attributes = traitMap(input.attributes, ATTRIBUTE_KEYS, 1, 1, 'Attributes');
  if (has('abilities')) patch.abilities = traitMap(input.abilities, ABILITY_KEYS, 0, 0, 'Abilities');

  if (has('virtues')) {
    const v = (input.virtues ?? {}) as Rec;
    const unknown = Object.keys(v).find((k) => !(VIRTUES as readonly string[]).includes(k));
    if (unknown) throw badRequest(`Unknown virtue: ${unknown}.`);
    const virtues: Record<string, number> = {};
    const conscience = v.conviction !== undefined ? 'conviction' : 'conscience';
    const control = v.instinct !== undefined ? 'instinct' : 'selfControl';
    for (const key of [conscience, control, 'courage']) virtues[key] = dots(v[key] ?? 1, 1, 5, key);
    patch.virtues = virtues;
  }

  if (has('pathRating')) patch.pathRating = dots(input.pathRating ?? 7, 0, 10, 'pathRating');
  if (has('willpowerPermanent')) patch.willpowerPermanent = dots(input.willpowerPermanent ?? 5, 1, 10, 'willpowerPermanent');
  if (partial && input.willpowerTemporary !== undefined) {
    patch.willpowerTemporary = dots(input.willpowerTemporary, 0, 10, 'willpowerTemporary');
  }
  if (partial && input.bloodPool !== undefined) patch.bloodPool = dots(input.bloodPool, 0, 50, 'bloodPool');
  if (partial && input.experienceTotal !== undefined) {
    patch.experienceTotal = dots(input.experienceTotal, 0, 10000, 'experienceTotal');
  }
  if (partial && input.experienceSpent !== undefined) {
    patch.experienceSpent = dots(input.experienceSpent, 0, 10000, 'experienceSpent');
  }

  if (has('disciplines')) patch.disciplines = named(input.disciplines, 'Discipline', 'level', 10);
  if (has('backgrounds')) patch.backgrounds = named(input.backgrounds, 'Background', 'level', 5);
  if (has('merits')) patch.merits = named(input.merits, 'Merit', 'points', 7);
  if (has('rituals')) patch.rituals = named(input.rituals, 'Ritual', 'level', 10);
  if (has('flaws')) patch.flaws = named(input.flaws, 'Flaw', 'points', 7);

  if (has('specialties')) {
    const list = input.specialties ?? [];
    if (!Array.isArray(list) || list.length > 40) throw badRequest('specialties must be a list.');
    patch.specialties = list.map((s: any) => {
      const trait = String(s?.trait ?? '');
      const kind = traitKind(trait);
      if (kind !== 'attribute' && kind !== 'ability') throw badRequest(`No specialty for ${trait || 'a blank trait'}.`);
      return { trait, text: text(s.text, 60) || 'Specialty' };
    });
  }

  return patch;
}

/**
 * What a player may propose for their own sheet: the traits, never the state.
 * Blood, Willpower spent, health and experience move only through the
 * Functions that model them.
 */
export const PROPOSABLE = [
  'dhampirConcept',
  'clan',
  'sect',
  'sire',
  'path',
  'generation',
  'attributes',
  'abilities',
  'specialties',
  'disciplines',
  'backgrounds',
  'virtues',
  'merits',
  'rituals',
  'flaws',
  'pathRating',
  'willpowerPermanent',
] as const;

/** Specialties are legal only at 4+ dots — checked against the merged sheet. */
export function checkSpecialties(sheet: {
  attributes: Record<string, number>;
  abilities: Record<string, number>;
  specialties: { trait: string }[];
  virtues: Record<string, number>;
  willpowerPermanent: number;
}): void {
  for (const s of sheet.specialties) {
    if (traitDots(sheet as any, s.trait) < 4) {
      throw badRequest(`A specialty in ${s.trait} needs four dots.`);
    }
  }
}
