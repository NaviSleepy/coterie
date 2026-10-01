/**
 * The table's reference library, as the sheet editors use it: names to offer,
 * and the entry a typed name refers to.
 */

import { traitLabel } from '$engine/index.ts';
import type { AnyRow } from './appwrite';

export type LibraryKind = 'clan' | 'merit' | 'flaw' | 'discipline' | 'power' | 'path' | 'trait' | 'background' | 'rule';

export const KIND_LABELS: Record<LibraryKind, string> = {
  clan: 'Clans',
  merit: 'Merits',
  flaw: 'Flaws',
  discipline: 'Disciplines',
  power: 'Discipline powers',
  path: 'Paths of Enlightenment',
  trait: 'Attributes and Abilities',
  background: 'Backgrounds',
  rule: 'House rules',
};

/** One entry's kind, for a picker. */
export const kindLabel = (k: LibraryKind) => (k === 'path' ? 'Path' : k === 'trait' ? 'Attribute or Ability' : KIND_LABELS[k].replace(/s$/, ''));

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
