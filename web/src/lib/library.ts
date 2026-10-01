/**
 * The table's reference library, as the sheet editors use it: names to offer,
 * and the entry a typed name refers to.
 */

import type { AnyRow } from './appwrite';

export type LibraryKind = 'clan' | 'merit' | 'flaw' | 'discipline' | 'power' | 'path' | 'background' | 'rule';

export const KIND_LABELS: Record<LibraryKind, string> = {
  clan: 'Clans',
  merit: 'Merits',
  flaw: 'Flaws',
  discipline: 'Disciplines',
  power: 'Discipline powers',
  path: 'Paths of Enlightenment',
  background: 'Backgrounds',
  rule: 'House rules',
};

/** One entry's kind, for a picker. */
export const kindLabel = (k: LibraryKind) => (k === 'path' ? 'Path' : KIND_LABELS[k].replace(/s$/, ''));

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
