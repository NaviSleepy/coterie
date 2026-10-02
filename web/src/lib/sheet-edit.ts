/**
 * Editing a sheet's traits: a full draft to bind inputs to, the fields that
 * differ from the sheet, and those differences in words. Players send the
 * differences as a proposal; the Storyteller sends them as an adjust. Either
 * way the server validates them again.
 */

import { ABILITY_KEYS, ATTRIBUTE_KEYS, traitLabel } from '$engine/index.ts';
import type { Character } from '$shared/codec.ts';

type Named = { name: string; level: number };
type Pointed = { name: string; points: number };

export interface Draft {
  template: 'vampire' | 'dhampir';
  dhampirConcept: string;
  /** The Storyteller sets this by hand for dhampirs (Antiquity); for vampires it follows Generation. */
  bloodPoolMax: number;
  clan: string;
  sect: string;
  sire: string;
  path: string;
  generation: number;
  attributes: Record<string, number>;
  abilities: Record<string, number>;
  specialties: { trait: string; text: string }[];
  disciplines: Named[];
  backgrounds: Named[];
  virtues: Record<string, number>;
  merits: Pointed[];
  flaws: Pointed[];
  pathRating: number;
  willpowerPermanent: number;
}

export type DraftKey = keyof Draft;
export const DRAFT_KEYS: DraftKey[] = [
  'template', 'dhampirConcept', 'bloodPoolMax', 'clan', 'sect', 'sire', 'path', 'generation', 'attributes', 'abilities', 'specialties',
  'disciplines', 'backgrounds', 'virtues', 'merits', 'flaws', 'pathRating', 'willpowerPermanent',
];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const fill = (keys: readonly string[], src: Record<string, number>, dflt: number) =>
  Object.fromEntries(keys.map((k) => [k, src[k] ?? dflt]));

/** The sheet's current traits, with any proposed changes laid over them. */
export function draftOf(c: Character, over: Partial<Draft> = {}): Draft {
  const base: Draft = {
    template: c.template === 'dhampir' ? 'dhampir' : 'vampire',
    dhampirConcept: c.dhampirConcept ?? '',
    bloodPoolMax: c.bloodPoolMax,
    clan: c.clan,
    sect: c.sect,
    sire: c.sire,
    path: c.path,
    generation: c.generation,
    attributes: fill(ATTRIBUTE_KEYS, c.attributes, 1),
    abilities: fill(ABILITY_KEYS, c.abilities, 0),
    specialties: c.specialties.map((s) => ({ trait: s.trait, text: s.text })),
    disciplines: c.disciplines.map((d) => ({ name: d.name, level: d.level })),
    backgrounds: c.backgrounds.map((b) => ({ name: b.name, level: b.level })),
    virtues: { ...c.virtues } as Record<string, number>,
    merits: c.merits.map((m) => ({ name: m.name, points: m.points })),
    flaws: c.flaws.map((f) => ({ name: f.name, points: f.points })),
    pathRating: c.pathRating,
    willpowerPermanent: c.willpowerPermanent,
  };
  const merged = { ...base, ...clone(over) };
  merged.attributes = fill(ATTRIBUTE_KEYS, merged.attributes, 1);
  merged.abilities = fill(ABILITY_KEYS, merged.abilities, 0);
  return merged;
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Blank rows dropped, names trimmed, and a cleared number box read as
 * unchanged rather than as zero: what the server would store.
 */
function tidy(d: Draft, now: Draft): Draft {
  const named = <T extends { name: string }>(list: T[]) =>
    list.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim() }));
  const levels = (list: Named[]) => named(list).map((x) => ({ ...x, level: num(x.level, 1) }));
  const points = (list: Pointed[]) => named(list).map((x) => ({ ...x, points: num(x.points, 1) }));
  return {
    ...d,
    generation: num(d.generation, now.generation),
    bloodPoolMax: num(d.bloodPoolMax, now.bloodPoolMax),
    dhampirConcept: d.dhampirConcept.trim(),
    pathRating: num(d.pathRating, now.pathRating),
    willpowerPermanent: num(d.willpowerPermanent, now.willpowerPermanent),
    virtues: Object.fromEntries(Object.entries(d.virtues).map(([k, v]) => [k, num(v, now.virtues[k] ?? 1)])),
    clan: d.clan.trim(),
    sect: d.sect.trim(),
    sire: d.sire.trim(),
    path: d.path.trim() || 'Humanity',
    disciplines: levels(d.disciplines),
    backgrounds: levels(d.backgrounds),
    merits: points(d.merits),
    flaws: points(d.flaws),
    specialties: d.specialties.filter((s) => s.trait),
  };
}

/** The fields of the draft that differ from the sheet, as whole values. */
export function changesFrom(c: Character, draft: Draft): Partial<Draft> {
  const now = draftOf(c);
  const next = tidy(draft, now);
  const out: Partial<Draft> = {};
  for (const key of DRAFT_KEYS) {
    if (JSON.stringify(next[key]) !== JSON.stringify(now[key])) (out as any)[key] = next[key];
  }
  return out;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function namedLines<T extends { name: string }>(
  before: T[],
  after: T[],
  value: (x: T) => number,
  unit: (n: number) => string,
): string[] {
  const lines: string[] = [];
  const was = new Map(before.map((x) => [x.name.toLowerCase(), x]));
  const now = new Map(after.map((x) => [x.name.toLowerCase(), x]));
  for (const [key, x] of now) {
    const old = was.get(key);
    if (!old) lines.push(`+ ${x.name}, ${unit(value(x))}`);
    else if (value(old) !== value(x)) lines.push(`${x.name} ${value(old)} → ${value(x)}`);
  }
  for (const [key, x] of was) if (!now.has(key)) lines.push(`− ${x.name}, ${unit(value(x))}`);
  return lines;
}

/** The changes in words, one line each, for the Storyteller to read at a glance. */
export function describe(c: Character, changes: Partial<Draft>): string[] {
  const now = draftOf(c);
  const lines: string[] = [];
  const text = (label: string, a: string, b: string) => lines.push(`${label}: ${a || '—'} → ${b || '—'}`);
  const dots = (map: 'attributes' | 'abilities' | 'virtues') => {
    const next = changes[map]!;
    for (const k of Object.keys({ ...now[map], ...next })) {
      if ((now[map][k] ?? 0) !== (next[k] ?? 0)) lines.push(`${traitLabel(k)} ${now[map][k] ?? 0} → ${next[k] ?? 0}`);
    }
  };

  if (changes.template !== undefined) text('Template', now.template, changes.template);
  if (changes.dhampirConcept !== undefined) text('Dhampir concept', now.dhampirConcept, changes.dhampirConcept);
  if (changes.bloodPoolMax !== undefined) lines.push(`Blood pool ${now.bloodPoolMax} → ${changes.bloodPoolMax}`);
  if (changes.clan !== undefined) text('Clan', now.clan, changes.clan);
  if (changes.sect !== undefined) text('Sect', now.sect, changes.sect);
  if (changes.sire !== undefined) text('Sire', now.sire, changes.sire);
  if (changes.generation !== undefined) lines.push(`Generation ${ordinal(now.generation)} → ${ordinal(changes.generation)}`);
  if (changes.attributes) dots('attributes');
  if (changes.abilities) dots('abilities');
  if (changes.specialties) {
    const key = (s: { trait: string; text: string }) => `${traitLabel(s.trait)} (${s.text || 'Specialty'})`;
    const was = new Set(now.specialties.map(key));
    const is = new Set(changes.specialties.map(key));
    for (const s of is) if (!was.has(s)) lines.push(`+ Specialty: ${s}`);
    for (const s of was) if (!is.has(s)) lines.push(`− Specialty: ${s}`);
  }
  if (changes.disciplines) lines.push(...namedLines(now.disciplines, changes.disciplines, (d) => d.level, (n) => `${n} dots`));
  if (changes.backgrounds) lines.push(...namedLines(now.backgrounds, changes.backgrounds, (b) => b.level, (n) => `${n} dots`));
  if (changes.merits) lines.push(...namedLines(now.merits, changes.merits, (m) => m.points, (n) => `${n} pt merit`));
  if (changes.flaws) lines.push(...namedLines(now.flaws, changes.flaws, (f) => f.points, (n) => `${n} pt flaw`));
  if (changes.virtues) dots('virtues');
  if (changes.path !== undefined) text('Path', now.path, changes.path);
  if (changes.pathRating !== undefined) lines.push(`${changes.path ?? now.path} ${now.pathRating} → ${changes.pathRating}`);
  if (changes.willpowerPermanent !== undefined) lines.push(`Willpower ${now.willpowerPermanent} → ${changes.willpowerPermanent}`);
  return lines;
}
