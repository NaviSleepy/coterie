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

function dots(value: unknown, min: number, max: number, what: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw badRequest(`${what} must be ${min}–${max}.`);
  }
  return value as number;
}

function traitMap(input: unknown, keys: readonly string[], min: number, dflt: number, what: string) {
  const src = (input ?? {}) as Rec;
  if (typeof src !== 'object' || Array.isArray(src)) throw badRequest(`${what} must be an object.`);
  const unknown = Object.keys(src).find((k) => !keys.includes(k));
  if (unknown) throw badRequest(`Unknown ${what.toLowerCase()}: ${unknown}.`);
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = src[key] === undefined ? dflt : dots(src[key], min, 5, key);
  return out;
}

function named(input: unknown, what: string, levelKey: 'level' | 'points', max: number) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 40) throw badRequest(`${what} must be a list.`);
  return input.map((item: any) => {
    if (typeof item?.name !== 'string' || !item.name.trim()) throw badRequest(`Every ${what.toLowerCase()} needs a name.`);
    const entry: any = { name: item.name.trim().slice(0, 60) };
    entry[levelKey] = dots(item[levelKey] ?? 1, levelKey === 'points' ? -7 : 0, max, `${entry.name}`);
    if (typeof item.notes === 'string') entry.notes = item.notes.slice(0, 500);
    return entry;
  });
}

function text(input: unknown, max: number): string | undefined {
  return typeof input === 'string' ? input.trim().slice(0, max) : undefined;
}

/**
 * `partial` is the Storyteller's adjust: only the fields present are
 * validated and returned. Creation validates everything and fills defaults.
 */
export function validateSheet(input: Rec, partial: boolean): CharacterPatch {
  const patch: CharacterPatch = {};
  const has = (k: string) => !partial || input[k] !== undefined;

  if (has('clan')) patch.clan = text(input.clan, 60) ?? '';
  if (has('sect')) patch.sect = text(input.sect, 60) ?? '';
  if (has('sire')) patch.sire = text(input.sire, 120) ?? '';
  if (has('path')) patch.path = text(input.path, 80) || 'Humanity';

  if (has('generation')) {
    const g = input.generation ?? 13;
    if (!isValidGeneration(g as number)) throw badRequest('generation must be 4–13.');
    patch.generation = g as number;
    patch.bloodPoolMax = bloodPoolMax(g as number);
    patch.bloodPerTurn = bloodPerTurn(g as number);
  }
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
