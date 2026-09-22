/**
 * The trait catalogue and the arithmetic that turns a sheet into a dice pool.
 *
 * A player asks for "Dexterity + Firearms", never "seven dice". The Function
 * looks both numbers up on the sheet it read from the database, so the size of
 * the pool is as server-authoritative as the dice themselves. Trait names are
 * game statistics — no descriptive text lives here.
 */

export const ATTRIBUTES = {
  physical: ['strength', 'dexterity', 'stamina'],
  social: ['charisma', 'manipulation', 'appearance'],
  mental: ['perception', 'intelligence', 'wits'],
} as const;

export const ABILITIES = {
  talents: [
    'alertness', 'athletics', 'awareness', 'brawl', 'empathy',
    'expression', 'intimidation', 'leadership', 'streetwise', 'subterfuge',
  ],
  skills: [
    'animalKen', 'crafts', 'drive', 'etiquette', 'firearms',
    'larceny', 'melee', 'performance', 'stealth', 'survival',
  ],
  knowledges: [
    'academics', 'computer', 'finance', 'investigation', 'law',
    'medicine', 'occult', 'politics', 'science', 'technology',
  ],
} as const;

/** Conscience/Conviction and Self-Control/Instinct are either-or per Path. */
export const VIRTUES = ['conscience', 'conviction', 'selfControl', 'instinct', 'courage'] as const;

export type AttributeKey = (typeof ATTRIBUTES)[keyof typeof ATTRIBUTES][number];
export type AbilityKey = (typeof ABILITIES)[keyof typeof ABILITIES][number];
export type VirtueKey = (typeof VIRTUES)[number];

export const ATTRIBUTE_KEYS: readonly string[] = Object.values(ATTRIBUTES).flat();
export const ABILITY_KEYS: readonly string[] = Object.values(ABILITIES).flat();

export interface Specialty {
  trait: string;
  text: string;
}

/** The mechanical sheet, as far as pool-building cares. */
export interface TraitSheet {
  attributes: Record<string, number>;
  abilities: Record<string, number>;
  virtues: Partial<Record<VirtueKey, number>>;
  specialties: Specialty[];
  willpowerPermanent: number;
}

/** "animalKen" → "Animal Ken". The UI and the roll label share this. */
export function traitLabel(key: string): string {
  if (key === 'selfControl') return 'Self-Control';
  if (key === 'willpower') return 'Willpower';
  const spaced = key.replace(/([A-Z])/g, ' $1');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function traitKind(key: string): 'attribute' | 'ability' | 'virtue' | 'willpower' | undefined {
  if (ATTRIBUTE_KEYS.includes(key)) return 'attribute';
  if (ABILITY_KEYS.includes(key)) return 'ability';
  if ((VIRTUES as readonly string[]).includes(key)) return 'virtue';
  if (key === 'willpower') return 'willpower';
  return undefined;
}

export function traitDots(sheet: TraitSheet, key: string): number {
  switch (traitKind(key)) {
    case 'attribute':
      return sheet.attributes[key] ?? 0;
    case 'ability':
      return sheet.abilities[key] ?? 0;
    case 'virtue':
      return sheet.virtues[key as VirtueKey] ?? 0;
    case 'willpower':
      return sheet.willpowerPermanent;
    default:
      return 0;
  }
}

/** Specialties are legal only at 4+ dots, and only for a trait that has one. */
export function specialtyApplies(sheet: TraitSheet, key: string): boolean {
  return traitDots(sheet, key) >= 4 && sheet.specialties.some((s) => s.trait === key);
}

export interface PoolSpec {
  basePool: number;
  label: string;
  specialtyApplies: boolean;
}

/**
 * One or two traits, summed off the sheet. Accepts the shapes V20 actually
 * uses: Attribute + Ability, a lone Attribute, a Virtue, or Willpower. Anything
 * else — two Abilities, an unknown key, the same trait twice — is refused
 * rather than guessed at, because a pool the Storyteller didn't expect is a
 * pool a player found a way to inflate.
 */
export function buildPool(
  sheet: TraitSheet,
  traits: string[],
  specialty?: string,
): { ok: true; pool: PoolSpec } | { ok: false; message: string } {
  if (!Array.isArray(traits) || traits.length === 0 || traits.length > 2) {
    return { ok: false, message: 'A roll names one or two traits.' };
  }
  const kinds = traits.map(traitKind);
  if (kinds.some((k) => k === undefined)) {
    return { ok: false, message: `Unknown trait: ${traits.find((t) => !traitKind(t))}.` };
  }
  if (new Set(traits).size !== traits.length) {
    return { ok: false, message: 'The same trait cannot be counted twice.' };
  }
  if (traits.length === 2) {
    const shape = [...kinds].sort().join('+');
    if (shape !== 'ability+attribute') {
      return { ok: false, message: 'Two-trait pools are an Attribute plus an Ability.' };
    }
  }
  if (specialty !== undefined && !traits.includes(specialty)) {
    return { ok: false, message: 'A specialty must belong to one of the rolled traits.' };
  }

  // Attribute first in the label, the way the book writes it.
  const ordered = [...traits].sort((a, b) => order(a) - order(b));
  return {
    ok: true,
    pool: {
      basePool: traits.reduce((sum, t) => sum + traitDots(sheet, t), 0),
      label: ordered.map(traitLabel).join(' + '),
      specialtyApplies: specialty !== undefined && specialtyApplies(sheet, specialty),
    },
  };
}

function order(key: string): number {
  return traitKind(key) === 'attribute' ? 0 : 1;
}

export type VirtueCheckKind = 'degeneration' | 'frenzy' | 'rotschreck';

/**
 * Which Virtue a check reads. Characters on a Path of Enlightenment carry
 * Conviction and Instinct in place of Conscience and Self-Control; the sheet
 * says which, so the check follows the sheet.
 */
export function virtueForCheck(
  virtues: TraitSheet['virtues'],
  kind: VirtueCheckKind,
): VirtueKey {
  switch (kind) {
    case 'degeneration':
      return virtues.conviction !== undefined && virtues.conscience === undefined
        ? 'conviction'
        : 'conscience';
    case 'frenzy':
      return virtues.instinct !== undefined && virtues.selfControl === undefined
        ? 'instinct'
        : 'selfControl';
    case 'rotschreck':
      return 'courage';
  }
}

/** Willpower's automatic success is once per turn, and the turn is the scene's. */
export function canSpendWillpower(
  willpowerTemporary: number,
  spentTurnRef: number,
  sceneTurnRef: number,
): { ok: true } | { ok: false; message: string } {
  if (willpowerTemporary <= 0) {
    return { ok: false, message: 'No temporary Willpower left to spend.' };
  }
  if (sceneTurnRef >= 0 && spentTurnRef === sceneTurnRef) {
    return {
      ok: false,
      message: 'Willpower already spent this turn. It returns when the Storyteller advances the turn.',
    };
  }
  return { ok: true };
}

/**
 * A single number identifying "this turn" across the whole chronicle, so a
 * counter stamped in scene one's third turn can't collide with scene two's
 * third turn. Outside a scene there is no turn; -1 never matches a stamp, so
 * caps apply per action rather than accumulating.
 */
export function turnRef(scene: { turnBase: number; turn: number } | null | undefined): number {
  return scene ? scene.turnBase + scene.turn : -1;
}
