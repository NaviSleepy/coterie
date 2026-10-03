/**
 * "Export as PDF": builds the sheet data from what this user can already read
 * and fills the blank V20 sheet in the browser. The template is a file in the
 * `sheet-templates` bucket that signed-in players may read; pdf-lib loads only
 * when someone exports.
 */

import { healthOf, parseJson, type Character } from '$shared/codec.ts';
import { client, storage } from './appwrite';
import { findEntry } from './library';
import type { SheetData } from './sheet-pdf';
import type { TableState } from './table.svelte';

export const SHEET_BUCKET = 'sheet-templates';
export const SHEET_FILE = 'v20-sheet';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function sheetData(table: TableState, c: Character): SheetData {
  const profile = table.profiles[c.$id] ?? {};
  const items = parseJson<{ name: string; note?: string }[]>(profile.equipment, []);
  const summaryOf = (name: string) => String(findEntry(table.library, 'equipment', name)?.summary ?? '');
  const isArmor = (name: string) => /^armor/i.test(summaryOf(name)) || /^armor/i.test(name);
  const isWeapon = (name: string) => /^(melee|ranged)\b/i.test(summaryOf(name));
  const armor = items.find((i) => isArmor(i.name));
  const dhampir = c.template === 'dhampir';

  return {
    name: String(profile.name ?? ''),
    player: table.members.find((m) => m.userId === c.ownerId)?.name ?? '',
    chronicle: String(table.chronicle?.name ?? ''),
    nature: String(profile.nature ?? ''),
    demeanor: String(profile.demeanor ?? ''),
    concept: String(profile.concept ?? ''),
    clan: dhampir ? ['Dhampir', c.clan && `(${c.clan})`].filter(Boolean).join(' ') : c.clan || 'Caitiff',
    generation: dhampir ? '' : ordinal(c.generation),
    sire: c.sire,
    notes: [
      c.sect && `Sect: ${c.sect}`,
      c.title && `Title: ${c.title}`,
      dhampir && c.dhampirConcept && `Dhampir concept: ${c.dhampirConcept}`,
    ].filter(Boolean) as string[],
    attributes: c.attributes,
    abilities: c.abilities,
    specialties: c.specialties,
    disciplines: c.disciplines,
    backgrounds: c.backgrounds,
    virtues: c.virtues,
    path: c.path === 'Humanity' ? 'Humanity' : c.path,
    pathRating: c.pathRating,
    willpowerPermanent: c.willpowerPermanent,
    willpowerTemporary: c.willpowerTemporary,
    bloodPool: c.bloodPool,
    bloodPoolMax: c.bloodPoolMax,
    bloodPerTurn: c.bloodPerTurn,
    health: healthOf(c),
    experienceTotal: c.experienceTotal,
    experienceSpent: c.experienceSpent,
    merits: c.merits,
    flaws: c.flaws,
    rituals: c.rituals ?? [],
    weapons: items.filter((i) => isWeapon(i.name)).map((i) => ({ name: i.name, detail: summaryOf(i.name) })),
    armor: armor ? { name: armor.name, detail: summaryOf(armor.name) } : null,
    gear: items.map((i) => (i.note ? `${i.name} — ${i.note}` : i.name)),
  };
}

/** The blank sheet, read with this user's session. */
export async function loadTemplate(): Promise<ArrayBuffer> {
  const url = new URL(storage.getFileView({ bucketId: SHEET_BUCKET, fileId: SHEET_FILE }));
  return (await client.call('GET', url, {}, {}, 'arrayBuffer')) as ArrayBuffer;
}

/** A plain-ASCII file name: browsers fall back to "download" for some others. */
export function fileName(name: string): string {
  const ascii = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^A-Za-z0-9 ._-]+/g, '').trim();
  return ascii || 'character';
}

/** Fills the sheet and hands it to the browser as a download. */
export async function exportSheet(table: TableState, c: Character, template: () => Promise<ArrayBuffer> = loadTemplate): Promise<void> {
  const [{ fillSheet }, bytes] = await Promise.all([import('./sheet-pdf'), template()]);
  const pdf = await fillSheet(bytes, sheetData(table, c));
  const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName(sheetData(table, c).name)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
