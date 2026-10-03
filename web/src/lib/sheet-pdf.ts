/**
 * Fills the V20 character sheet (the blank PDF in the `sheet-templates`
 * bucket) with a character. The sheet has no form fields, so everything is
 * drawn at the sheet's own coordinates: text on its lines, filled circles in
 * its dots, marks in its boxes. Coordinates below are in PDF points from the
 * top-left of a page, as read off the template; `y()` flips them for pdf-lib.
 *
 * Pure: plain data in, PDF bytes out. The page builds the data from the table.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface SheetData {
  name: string;
  player: string;
  chronicle: string;
  nature: string;
  demeanor: string;
  concept: string;
  clan: string;
  generation: string;
  sire: string;
  /** Extra lines for the empty column under Advantages: sect, title, template… */
  notes: string[];
  attributes: Record<string, number>;
  abilities: Record<string, number>;
  specialties: { trait: string; text: string }[];
  disciplines: { name: string; level: number }[];
  backgrounds: { name: string; level: number }[];
  virtues: Record<string, number>;
  path: string;
  pathRating: number;
  willpowerPermanent: number;
  willpowerTemporary: number;
  bloodPool: number;
  bloodPoolMax: number;
  bloodPerTurn: number;
  health: { bashing: number; lethal: number; aggravated: number };
  experienceTotal: number;
  experienceSpent: number;
  merits: { name: string; points: number }[];
  flaws: { name: string; points: number }[];
  rituals: { name: string; level: number }[];
  /** Weapons for the combat table: name, then the library's summary if there is one. */
  weapons: { name: string; detail: string }[];
  armor: { name: string; detail: string } | null;
  gear: string[];
}

export interface WeaponStats {
  damage?: string;
  range?: string;
  rate?: string;
  clip?: string;
  conceal?: string;
}

/**
 * Reads the combat columns out of a library summary written the usual way
 * ("Damage Strength +1 lethal… range 20, rate 3, clip 17+1, hides in a
 * pocket"). Missing pieces stay blank.
 */
export function weaponStats(summary: string): WeaponStats {
  const s = summary.replace(/\s+/g, ' ');
  const out: WeaponStats = {};
  const damage = /Damage ([^.,;]+)/i.exec(s);
  const dice = /(\d+) dice/i.exec(s);
  if (damage) out.damage = damage[1].replace(/Strength/i, 'Str').replace(/\s*\(.*?\)/, '').trim();
  else if (dice) out.damage = dice[1];
  const range = /range (\d+)/i.exec(s);
  if (range) out.range = range[1];
  const rate = /rate (\d+)/i.exec(s);
  if (rate) out.rate = rate[1];
  const clip = /(?:clip|holds) ([\d+]+)/i.exec(s);
  if (clip) out.clip = clip[1];
  const hides = /hides in an? (pocket|jacket|trench ?coat)/i.exec(s);
  if (hides) out.conceal = hides[1][0].toUpperCase();
  else if (/can[’']?t (?:be )?hid|not concealable/i.test(s)) out.conceal = 'N';
  return out;
}

/** Armor rating, Dexterity penalty and what it is, from "Armor (Kevlar vest). +3 soak… −1 dice…". */
export function armorStats(summary: string): { rating?: string; penalty?: string; description?: string } {
  const rating = /\+(\d+) soak/i.exec(summary);
  const penalty = /[−-](\d+) dice/i.exec(summary);
  const what = /\(([^)]+)\)/.exec(summary);
  return { rating: rating?.[1], penalty: penalty ? (penalty[1] === '0' ? '0' : `−${penalty[1]}`) : undefined, description: what?.[1] };
}

/** Characters the sheet's standard fonts (WinAnsi) can't draw, and what to draw instead. */
const SUBSTITUTE: Record<string, string> = { '−': '-', '‐': '-', 'ı': 'i', 'İ': 'I', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ő': 'o', 'ű': 'u', 'Ő': 'O', 'Ű': 'U' };

/** Makes `s` drawable in `font`: known substitutes, then accents stripped, then '?' for anything left. */
export function printable(font: PDFFont, s: string): string {
  let out = '';
  for (const ch of s) {
    const candidates = [SUBSTITUTE[ch] ?? ch, ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''), '?'];
    for (const c of candidates) {
      try {
        font.encodeText(c);
        out += c;
        break;
      } catch {
        // not in WinAnsi: try the next form
      }
    }
  }
  return out;
}

const INK = rgb(0.08, 0.06, 0.1);
const HAND = rgb(0.12, 0.12, 0.45);

/** Five-dot rows: the x where the circles start, and the y of the row's top. Each circle is a fifth of 42.8 pt. */
const DOT_W = 42.8 / 5;
const ATTR_ROWS: Record<string, [number, number]> = {
  strength: [182.8, 222.9], dexterity: [182.8, 235.9], stamina: [182.8, 248.9],
  charisma: [357.3, 222.9], manipulation: [357.3, 235.9], appearance: [357.3, 248.9],
  perception: [530.8, 222.9], intelligence: [530.8, 235.9], wits: [530.8, 248.9],
};
const ABILITY_COLUMNS: [number, string[]][] = [
  [182.8, ['alertness', 'athletics', 'awareness', 'brawl', 'empathy', 'expression', 'intimidation', 'leadership', 'streetwise', 'subterfuge']],
  [357.3, ['animalKen', 'crafts', 'drive', 'etiquette', 'firearms', 'larceny', 'melee', 'performance', 'stealth', 'survival']],
  [530.8, ['academics', 'computer', 'finance', 'investigation', 'law', 'medicine', 'occult', 'politics', 'science', 'technology']],
];
const ABILITY_TOP = 300.9;
const ROW = 13;
/** Ten-dot tracks and box rows: x of the first, step between them. */
const TRACK_X = 258.7;
const TRACK_STEP = 12.84;
const BOX_X = 258.0;

export async function fillSheet(template: ArrayBuffer | Uint8Array, d: SheetData): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template);
  const serif = await pdf.embedFont('Times-Roman');
  const italic = await pdf.embedFont('Times-Italic');
  const [p1, p2, p3] = pdf.getPages();
  const H = p1.getHeight();
  const y = (top: number) => H - top;

  /** Text on a line whose label/underline box starts at `top`; shrinks to fit `width`. */
  const text = (page: PDFPage, s: string, x: number, top: number, opts: { size?: number; width?: number; font?: PDFFont; right?: boolean } = {}) => {
    if (!s) return;
    const font = opts.font ?? serif;
    s = printable(font, s);
    let size = opts.size ?? 10;
    const width = opts.width ?? 200;
    while (size > 5 && font.widthOfTextAtSize(s, size) > width) size -= 0.5;
    let out = s;
    while (out.length > 1 && font.widthOfTextAtSize(out, size) > width) out = out.slice(0, -2) + '…';
    const w = font.widthOfTextAtSize(out, size);
    page.drawText(out, { x: opts.right ? x - w : x, y: y(top + 11.5), size, font, color: HAND });
  };
  /** Fills the first `n` of five circles in a row (`x0`, `top` as read off the sheet). */
  const dots = (page: PDFPage, x0: number, top: number, n: number, max = 5) => {
    for (let i = 0; i < Math.min(n, max); i++) {
      page.drawCircle({ x: x0 + DOT_W * (i + 0.5), y: y(top + 7.1), size: 3.3, color: INK });
    }
  };
  /** Ten circles in a track, `n` filled. */
  const track = (top: number, n: number) => {
    for (let i = 0; i < Math.min(n, 10); i++) p1.drawCircle({ x: TRACK_X + 4.65 + TRACK_STEP * i, y: y(top + 8.1), size: 3.6, color: INK });
  };
  /** A box: filled, crossed out, or one of the damage marks. */
  const box = (page: PDFPage, x0: number, top: number, mark: 'fill' | 'slash' | 'x' | 'star') => {
    const cx = x0 + 5.35;
    const cy = y(top + 8.3);
    const r = 3.4;
    const line = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.1, color: INK });
    if (mark === 'fill') page.drawRectangle({ x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, color: INK });
    if (mark === 'slash' || mark === 'x' || mark === 'star') line(cx - r, cy - r, cx + r, cy + r);
    if (mark === 'x' || mark === 'star') line(cx - r, cy + r, cx + r, cy - r);
    if (mark === 'star') line(cx, cy - r - 0.5, cx, cy + r + 0.5);
  };

  // ---- Page one: identity
  text(p1, d.name, 103, 137.2, { width: 132 });
  text(p1, d.player, 106, 153.2, { width: 130 });
  text(p1, d.chronicle, 122, 169.2, { width: 115 });
  text(p1, d.nature, 282, 137.2, { width: 128 });
  text(p1, d.demeanor, 299, 153.2, { width: 112 });
  text(p1, d.concept, 287, 169.2, { width: 124 });
  text(p1, d.clan, 444, 137.2, { width: 128 });
  text(p1, d.generation, 477, 153.2, { width: 95 });
  text(p1, d.sire, 442, 169.2, { width: 130 });

  // Attributes and Abilities, with specialties written small at the end of their line.
  const specialty = (trait: string) => d.specialties.filter((s) => s.trait === trait).map((s) => s.text).join(', ');
  for (const [key, [x0, top]] of Object.entries(ATTR_ROWS)) {
    dots(p1, x0, top, d.attributes[key] ?? 1);
    const s = specialty(key);
    if (s) text(p1, s, x0 - 2, top - 4.7, { size: 6.5, width: 48, font: italic, right: true });
  }
  for (const [x0, keys] of ABILITY_COLUMNS) {
    keys.forEach((key, i) => {
      const top = ABILITY_TOP + ROW * i;
      dots(p1, x0, top, d.abilities[key] ?? 0);
      const s = specialty(key);
      if (s) text(p1, s, x0 - 2, top - 4.7, { size: 6.5, width: 48, font: italic, right: true });
    });
  }

  // Disciplines and Backgrounds: six lines each; the rest go to Other Traits on page two.
  const overflow: { name: string; level: number }[] = [];
  const listWithDots = (items: { name: string; level: number }[], textX: number, dotX: number) => {
    items.forEach((it, i) => {
      if (i >= 6) return overflow.push(it);
      text(p1, it.name, textX, 478.2 + ROW * i, { width: 110 });
      dots(p1, dotX, 482.9 + ROW * i, it.level);
    });
  };
  listWithDots(d.disciplines, 69, 182.8);
  listWithDots(d.backgrounds, 243.5, 357.3);

  // Virtues
  dots(p1, 530.8, 482.9, d.virtues.conscience ?? d.virtues.conviction ?? 1);
  dots(p1, 530.8, 508.9, d.virtues.selfControl ?? d.virtues.instinct ?? 1);
  dots(p1, 530.8, 534.9, d.virtues.courage ?? 1);
  if (d.virtues.conviction !== undefined) text(p1, 'Conviction', 529, 491.5, { size: 6.5, width: 44, font: italic, right: true });
  if (d.virtues.instinct !== undefined) text(p1, 'Instinct', 529, 517.5, { size: 6.5, width: 44, font: italic, right: true });

  // The empty column under Advantages: sect, title and the like.
  d.notes.slice(0, 14).forEach((line, i) => text(p1, line, 69, 582.2 + ROW * i, { width: 155, size: 9 }));

  // Humanity or Path, Willpower, blood
  text(p1, d.path, 320.5 - Math.min(124, serif.widthOfTextAtSize(printable(serif, d.path), 10)) / 2, 592.3, { width: 124 });
  track(608.7, d.pathRating);
  track(670.7, d.willpowerPermanent);
  for (let i = 0; i < Math.min(d.willpowerTemporary, 10); i++) box(p1, BOX_X + 12.87 * i, 682.9, 'fill');
  for (let i = 0; i < 20; i++) {
    const x0 = BOX_X + 12.87 * (i % 10);
    const top = i < 10 ? 732.9 : 744.9;
    if (i < d.bloodPool) box(p1, x0, top, 'fill');
    else if (i >= d.bloodPoolMax) box(p1, x0, top, 'slash');
  }
  if (d.bloodPoolMax > 20) text(p1, `pool ${d.bloodPool} / ${d.bloodPoolMax}`, 386, 739, { size: 7, width: 36 });
  text(p1, String(d.bloodPerTurn), 346, 755.5, { width: 24 });

  // Health: aggravated first, then lethal, then bashing, top down.
  const marks: ('star' | 'x' | 'slash')[] = [
    ...Array(d.health.aggravated).fill('star'),
    ...Array(d.health.lethal).fill('x'),
    ...Array(d.health.bashing).fill('slash'),
  ];
  const healthTops = [596.4, 610.4, 623.4, 637.4, 651.4, 665.4, 679.4];
  marks.slice(0, 7).forEach((m, i) => box(p1, 555.3, healthTops[i], m));

  text(p1, `${d.experienceTotal} total · ${d.experienceSpent} spent · ${d.experienceTotal - d.experienceSpent} left`, 430, 750, { width: 140, size: 9 });

  // ---- Page two
  d.merits.slice(0, 7).forEach((m, i) => {
    text(p2, m.name, 69.5, 171.6 + ROW * i, { width: 115 });
    text(p2, String(m.points), 280, 171.6 + ROW * i, { width: 28 });
  });
  d.flaws.slice(0, 7).forEach((f, i) => {
    text(p2, f.name, 332.5, 171.6 + ROW * i, { width: 115 });
    text(p2, String(f.points), 543, 171.6 + ROW * i, { width: 28 });
  });
  // Other Traits: what didn't fit above, three columns of four.
  const otherCols: [number, number][] = [[68.5, 182.5], [243, 357.0], [416.5, 530.5]];
  overflow.slice(0, 12).forEach((it, i) => {
    const [tx, dx] = otherCols[Math.floor(i / 4)];
    const row = i % 4;
    text(p2, it.name, tx, 287.2 + ROW * row, { width: 110 });
    dots(p2, dx, 291.9 + ROW * row, it.level);
  });
  d.rituals.slice(0, 8).forEach((r, i) => {
    text(p2, r.name, 69.5, 378.6 + ROW * i, { width: 182 });
    text(p2, r.level ? String(r.level) : 'rite', 270, 378.6 + ROW * i, { width: 36 });
  });
  text(p2, String(d.experienceTotal), 100, 508.6, { width: 200 });
  text(p2, String(d.experienceSpent), 132, 521.6, { width: 170 });

  // Combat: up to six weapons, the library's summary across the stat columns.
  // Row tops, from the table's rulings at 683.1 and every 16.4 pt after.
  const weaponRows = [684, 700.6, 717, 733.6, 750, 766.4];
  // Column centres: Damage, Range, Rate, Clip, Conceal.
  const cols: [keyof WeaponStats, number, number][] = [['damage', 251, 36], ['range', 290, 26], ['rate', 327, 26], ['clip', 365, 30], ['conceal', 403, 26]];
  d.weapons.slice(0, 6).forEach((w, i) => {
    text(p2, w.name, 93, weaponRows[i], { width: 105, size: 8.5 });
    const stats = weaponStats(w.detail);
    if (!Object.keys(stats).length) return text(p2, w.detail, 204, weaponRows[i] + 0.5, { width: 214, size: 6.5, font: italic });
    for (const [key, centre, width] of cols) {
      const v = stats[key] && printable(serif, stats[key]);
      if (!v) continue;
      const size = serif.widthOfTextAtSize(v, 8.5) > width ? 6.5 : 8.5;
      text(p2, v, centre - Math.min(width, serif.widthOfTextAtSize(v, size)) / 2, weaponRows[i], { width, size });
    }
  });
  if (d.armor) {
    const a = armorStats(d.armor.detail);
    text(p2, d.armor.name.replace(/^Armor,\s*/i, ''), 462, 685.9, { width: 110, size: 9 });
    if (a.rating) text(p2, a.rating, 468, 698.9, { width: 100, size: 9 });
    if (a.penalty) text(p2, `${a.penalty} Dexterity dice`, 476, 711.9, { width: 100, size: 9 });
    text(p2, a.description ?? d.armor.detail, 432.5, 737.9, { width: 139, size: 8, font: italic });
  }

  // ---- Page three: what's carried
  d.gear.slice(0, 5).forEach((g, i) => text(p3, g, 69.5, 481.6 + ROW * i, { width: 238, size: 9 }));

  return pdf.save();
}
