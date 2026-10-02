/**
 * The table's reference library, as the sheet editors use it: names to offer,
 * and the entry a typed name refers to.
 */

import { traitLabel } from '$engine/index.ts';
import type { AnyRow } from './appwrite';

export type LibraryKind = 'clan' | 'merit' | 'flaw' | 'discipline' | 'power' | 'path' | 'trait' | 'archetype' | 'equipment' | 'concept' | 'ritual' | 'background' | 'rule';

export const KIND_LABELS: Record<LibraryKind, string> = {
  clan: 'Clans',
  merit: 'Merits',
  flaw: 'Flaws',
  discipline: 'Disciplines',
  power: 'Discipline powers',
  path: 'Paths of Enlightenment',
  trait: 'Attributes and Abilities',
  archetype: 'Natures and Demeanors',
  equipment: 'Weapons and armor',
  concept: 'Dhampir concepts',
  ritual: 'Rituals and rites',
  background: 'Backgrounds',
  rule: 'House rules',
};

/** One entry's kind, for a picker. */
export const kindLabel = (k: LibraryKind) => (k === 'path' ? 'Path' : k === 'trait' ? 'Attribute or Ability' : k === 'archetype' ? 'Archetype' : k === 'equipment' ? 'Weapon or armor' : k === 'concept' ? 'Dhampir concept' : k === 'ritual' ? 'Ritual or rite' : KIND_LABELS[k].replace(/s$/, ''));

export function entriesOf(library: Record<string, AnyRow>, kind: LibraryKind): AnyRow[] {
  return Object.values(library)
    .filter((e) => e.kind === kind)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function findEntry(library: Record<string, AnyRow>, kind: LibraryKind, name: string): AnyRow | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return Object.values(library).find((e) => e.kind === kind && String(e.name).toLowerCase() === key);
}

/** One line for a tooltip or a hint under a field. */
export function gloss(entry: AnyRow | undefined): string {
  if (!entry) return '';
  return [entry.summary, entry.page].filter(Boolean).join(' · ');
}

/**
 * An Attribute or Ability write-up is one summary line, then a line per dot
 * starting with that many bullets: "••• Good: You rarely fall ill."
 */
function dotLines(library: Record<string, AnyRow>, key: string): { intro: string; dots: string[] } | undefined {
  const entry = findEntry(library, 'trait', traitLabel(key));
  if (!entry?.summary) return undefined;
  const intro: string[] = [];
  const dots: string[] = [];
  for (const line of String(entry.summary).split('\n')) {
    const m = /^(•{1,5})\s*(.+)$/.exec(line.trim());
    if (m) dots[m[1].length] = m[2];
    else if (line.trim()) intro.push(line.trim());
  }
  return { intro: intro.join(' '), dots };
}

/** What a rating of n in this trait means, or '' if the table hasn't written it up. */
export function dotMeaning(library: Record<string, AnyRow>, key: string, n: number): string {
  return dotLines(library, key)?.dots[n] ?? '';
}

/** The whole ladder for a tooltip, with the character's own rating marked. */
export function dotLadder(library: Record<string, AnyRow>, key: string, n: number): string {
  const lines = dotLines(library, key);
  if (!lines) return '';
  const rungs = [1, 2, 3, 4, 5].filter((i) => lines.dots[i]).map((i) => `${i === n ? '▸ ' : '   '}${'•'.repeat(i)} ${lines.dots[i]}`);
  return [lines.intro, ...rungs].filter(Boolean).join('\n');
}

/**
 * A Discipline power's write-up starts with what it needs, then a colon:
 * "Auspex 2: …", "Thaumaturgy (Path of Blood) 3: …", or for a combination
 * "Auspex 2 + Presence 3: …". Alternatives inside one requirement use "or".
 */
export interface Requirement {
  discipline: string;
  path: string | null;
  level: number;
}

export interface PowerEntry {
  entry: AnyRow;
  /** Every part must be met; within a part, any one alternative will do. */
  needs: Requirement[][];
  text: string;
}

const REQ = /^(.+?)(?:\s*\(([^)]+)\))?\s+(\d{1,2})$/;

export function parsePower(entry: AnyRow): PowerEntry | null {
  const summary = String(entry.summary ?? '');
  const colon = summary.indexOf(': ');
  if (colon < 0) return null;
  const head = summary.slice(0, colon);
  const needs: Requirement[][] = [];
  for (const part of head.split(/\s+\+\s+/)) {
    const alts: Requirement[] = [];
    for (const alt of part.split(/\s+or\s+/)) {
      const m = REQ.exec(alt.trim());
      if (!m || /ritual/i.test(m[1])) return null;
      alts.push({ discipline: m[1].trim(), path: m[2]?.trim() ?? null, level: Number(m[3]) });
    }
    needs.push(alts);
  }
  return { entry, needs, text: summary.slice(colon + 2) };
}

export function powersOf(library: Record<string, AnyRow>): PowerEntry[] {
  return entriesOf(library, 'power').map(parsePower).filter((p): p is PowerEntry => p !== null);
}

/** "Thaumaturgy (Path of Blood)" → base and path, both lower-cased for matching. */
const norm = (s: string | null) => (s ?? '').trim().toLowerCase().replace(/^the\s+/, '').replace(/[’']/g, "'");

export function splitDiscipline(name: string): { base: string; path: string | null } {
  const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(name.trim());
  return m ? { base: norm(m[1]), path: norm(m[2]) } : { base: norm(name), path: null };
}

export interface DisciplineLevels {
  name: string;
  level: number;
  /** The powers this rating reaches, lowest first. */
  powers: PowerEntry[];
  /** Paths the library knows for a path-based Discipline the sheet names without one. */
  paths: string[];
}

/** What each of the character's Disciplines does at their rating, from the library. */
export function disciplineLevels(library: Record<string, AnyRow>, disciplines: { name: string; level: number }[]): DisciplineLevels[] {
  const single = powersOf(library).filter((p) => p.needs.length === 1 && p.needs[0].length === 1);
  return disciplines
    .filter((d) => d.name.trim())
    .map((d) => {
      const { base, path } = splitDiscipline(d.name);
      const mine = single.filter((p) => norm(p.needs[0][0].discipline) === base);
      const withPath = mine.filter((p) => p.needs[0][0].path);
      let powers: PowerEntry[];
      let paths: string[] = [];
      if (path) powers = mine.filter((p) => norm(p.needs[0][0].path) === path);
      else if (withPath.length && withPath.length === mine.length) {
        powers = [];
        paths = [...new Set(withPath.map((p) => p.needs[0][0].path!))].sort();
      } else powers = mine;
      powers = powers.filter((p) => p.needs[0][0].level <= d.level).sort((a, b) => a.needs[0][0].level - b.needs[0][0].level);
      return { name: d.name, level: d.level, powers, paths };
    });
}

/** Combination powers whose every requirement the character meets. */
export function combosFor(library: Record<string, AnyRow>, disciplines: { name: string; level: number }[]): PowerEntry[] {
  const best = new Map<string, number>();
  for (const d of disciplines) {
    const { base } = splitDiscipline(d.name);
    best.set(base, Math.max(best.get(base) ?? 0, d.level));
  }
  const met = (r: Requirement) => (best.get(norm(r.discipline)) ?? 0) >= r.level;
  return powersOf(library).filter((p) => p.needs.length > 1 && p.needs.every((alts) => alts.some(met)));
}

/** "Auspex 2 + Presence 3", for showing what a combination needs. */
export function needsLabel(p: PowerEntry): string {
  return p.needs.map((alts) => alts.map((r) => `${r.discipline}${r.path ? ` (${r.path})` : ''} ${r.level}`).join(' or ')).join(' + ');
}

/**
 * Rituals are written "Thaumaturgy ritual 3: …" or "Koldunic Sorcery rite 2: …".
 * Each tradition is cast through a Discipline, and a caster can learn rituals
 * up to their rating in it.
 */
const RITUAL_DISCIPLINE: Record<string, string> = {
  thaumaturgy: 'thaumaturgy',
  necromancy: 'necromancy',
  'abyss mysticism': 'obtenebration',
  'assamite sorcery': 'assamite sorcery',
  'koldunic sorcery': 'koldunic sorcery',
  dririmancy: 'dririmancy',
};

export interface RitualEntry {
  entry: AnyRow;
  tradition: string;
  level: number;
  text: string;
}

export function parseRitual(entry: AnyRow): RitualEntry | null {
  const m = /^(.+?)\s+(?:ritual|rite)\s+(\d{1,2}):\s*(.*)$/s.exec(String(entry.summary ?? ''));
  return m ? { entry, tradition: m[1], level: Number(m[2]), text: m[3] } : null;
}

/** Rituals the character's Disciplines are high enough to learn, by tradition, lowest first. */
export function ritualsWithinReach(
  library: Record<string, AnyRow>,
  disciplines: { name: string; level: number }[],
): { tradition: string; rating: number; rituals: RitualEntry[] }[] {
  const rating = new Map<string, number>();
  for (const d of disciplines) {
    const { base } = splitDiscipline(d.name);
    rating.set(base, Math.max(rating.get(base) ?? 0, d.level));
  }
  const groups = new Map<string, { tradition: string; rating: number; rituals: RitualEntry[] }>();
  for (const r of entriesOf(library, 'ritual').map(parseRitual)) {
    if (!r) continue;
    const via = RITUAL_DISCIPLINE[norm(r.tradition)];
    const have = via ? (rating.get(via) ?? 0) : 0;
    if (!have || r.level > have) continue;
    const g = groups.get(r.tradition) ?? { tradition: r.tradition, rating: have, rituals: [] };
    g.rituals.push(r);
    groups.set(r.tradition, g);
  }
  for (const g of groups.values()) g.rituals.sort((a, b) => a.level - b.level || String(a.entry.name).localeCompare(String(b.entry.name)));
  return [...groups.values()];
}
