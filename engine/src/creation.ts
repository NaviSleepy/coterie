/**
 * The character-creation budget: V20's dots by priority plus freebie points,
 * the thin-blooded variant from Time of Thin Blood, and the dhampir variant
 * from Accursed Heirs. The creation form shows it
 * live; the server runs the same function and refuses a player's sheet that
 * goes over without the Storyteller's approval.
 *
 * Priorities aren't declared: the cheapest assignment of 7/5/3 (and 13/9/5)
 * across the groups is taken, so a player never pays for picking them wrong.
 */

import { ABILITIES, ATTRIBUTES } from './traits.ts';
import { disciplineCap, LOWEST_GENERATION } from './generation.ts';

export interface CreationRules {
  attributes: [number, number, number];
  abilities: [number, number, number];
  /** Highest Ability rating bought with dots; anything above costs freebies. */
  abilityCap: number;
  disciplines: number;
  backgrounds: number;
  virtues: number;
  freebies: number;
  /** Flaws refund freebies only up to this many points. */
  maxFlaws: number;
  maxMerits: number;
  /** Generation dots a starting character may hold. */
  maxGeneration: number;
  /** Whether Generation below 13th is paid for with the Generation Background. */
  generationCosts: boolean;
  cost: { attribute: number; ability: number; discipline: number; background: number; virtue: number; path: number; willpower: number };
}

export const CREATION_RULES: Record<'vampire' | 'thinBlooded' | 'dhampir', CreationRules> = {
  vampire: {
    attributes: [7, 5, 3],
    abilities: [13, 9, 5],
    abilityCap: 3,
    disciplines: 3,
    backgrounds: 5,
    virtues: 7,
    freebies: 15,
    maxFlaws: 7,
    maxMerits: 7,
    maxGeneration: 5,
    generationCosts: true,
    cost: { attribute: 5, ability: 2, discipline: 7, background: 1, virtue: 2, path: 1, willpower: 1 },
  },
  // Time of Thin Blood, for 14th and 15th Generation: 6/5/3, 12/8/5, two
  // Discipline dots at 10 freebies apiece, 18 freebies, no Generation to buy.
  thinBlooded: {
    attributes: [6, 5, 3],
    abilities: [12, 8, 5],
    abilityCap: 3,
    disciplines: 2,
    backgrounds: 5,
    virtues: 7,
    freebies: 18,
    maxFlaws: 7,
    maxMerits: 7,
    maxGeneration: 0,
    generationCosts: false,
    cost: { attribute: 5, ability: 2, discipline: 10, background: 1, virtue: 2, path: 1, willpower: 1 },
  },
  // Accursed Heirs: 6/4/3, 11/7/4, one Discipline dot plus a free dot of
  // Potence, 18 freebies, Disciplines at 10 a dot.
  dhampir: {
    attributes: [6, 4, 3],
    abilities: [11, 7, 4],
    abilityCap: 3,
    disciplines: 2,
    backgrounds: 5,
    virtues: 7,
    freebies: 18,
    maxFlaws: 7,
    maxMerits: 7,
    maxGeneration: 0,
    generationCosts: false,
    cost: { attribute: 5, ability: 2, discipline: 10, background: 1, virtue: 2, path: 1, willpower: 1 },
  },
};

/** Which budget a sheet is held to: a vampire's, a thin-blood's (14th and 15th Generation) or a dhampir's. */
export type Template = 'vampire' | 'thinBlooded' | 'dhampir';

export function budgetKind(sheet: { template?: string | null; generation?: number }): Template {
  if (sheet.template === 'dhampir') return 'dhampir';
  return (sheet.generation ?? LOWEST_GENERATION) >= 14 ? 'thinBlooded' : 'vampire';
}
/** A campaign's changes to the book's numbers, per template. Missing fields keep the book's. */
export type CreationOverrides = Partial<Record<Template, Partial<Omit<CreationRules, 'generationCosts' | 'cost'> & { cost: Partial<CreationRules['cost']> }>>>;

/** The numbers a campaign uses for a template: the book's, with its overrides laid over. */
export function rulesFor(template: Template, overrides?: CreationOverrides | null): CreationRules {
  const book = CREATION_RULES[template];
  const o = overrides?.[template] ?? {};
  return { ...book, ...o, generationCosts: book.generationCosts, cost: { ...book.cost, ...(o.cost ?? {}) } } as CreationRules;
}

/** What a Storyteller may set, and the range each number must fall in. */
export const CREATION_LIMITS = {
  attributes: [0, 15],
  abilities: [0, 30],
  abilityCap: [1, 5],
  disciplines: [0, 10],
  backgrounds: [0, 20],
  virtues: [0, 15],
  freebies: [0, 100],
  maxFlaws: [0, 20],
  maxMerits: [0, 20],
  maxGeneration: [0, 9],
  cost: [0, 20],
} as const;

/**
 * Checks a Storyteller's overrides and returns them clean (only known fields,
 * whole numbers in range), or throws an Error naming the first bad one.
 */
export function cleanCreationOverrides(input: unknown): CreationOverrides {
  if (input === null || input === undefined) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('creationRules must be an object.');
  const out: CreationOverrides = {};
  const num = (v: unknown, [lo, hi]: readonly [number, number], what: string) => {
    if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) throw new Error(`${what} must be a whole number from ${lo} to ${hi}.`);
    return v as number;
  };
  for (const [template, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!(template in CREATION_RULES)) throw new Error(`Unknown template: ${template}.`);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${template} rules must be an object.`);
    const t: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
      if (key === 'attributes' || key === 'abilities') {
        if (!Array.isArray(v) || v.length !== 3) throw new Error(`${template} ${key} must be three numbers.`);
        t[key] = v.map((x, i) => num(x, CREATION_LIMITS[key], `${template} ${key} ${i + 1}`));
      } else if (key === 'cost') {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${template} cost must be an object.`);
        const cost: Record<string, number> = {};
        for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) {
          if (!(ck in CREATION_RULES[template as Template].cost)) throw new Error(`Unknown cost: ${ck}.`);
          cost[ck] = num(cv, CREATION_LIMITS.cost, `${template} ${ck} cost`);
        }
        t.cost = cost;
      } else if (key in CREATION_LIMITS) {
        t[key] = num(v, CREATION_LIMITS[key as keyof typeof CREATION_LIMITS] as readonly [number, number], `${template} ${key}`);
      } else {
        throw new Error(`Unknown creation rule: ${key}.`);
      }
    }
    out[template as Template] = t as CreationOverrides[Template];
  }
  return out;
}

export interface CreationSheet {
  template?: string | null;
  clan?: string;
  generation?: number;
  attributes?: Record<string, number>;
  abilities?: Record<string, number>;
  disciplines?: { name: string; level: number }[];
  backgrounds?: { name: string; level: number }[];
  virtues?: Record<string, number>;
  pathRating?: number;
  willpowerPermanent?: number;
  merits?: { name: string; points: number }[];
  flaws?: { name: string; points: number }[];
}

export interface CreationLine {
  key: 'attributes' | 'abilities' | 'disciplines' | 'backgrounds' | 'virtues' | 'path' | 'willpower' | 'merits';
  label: string;
  /** Dots (or points) spent in this section. */
  spent: number;
  /** What the section gives for free, before freebies. */
  budget: number;
  /** Freebie points this section costs. */
  freebies: number;
  /** For Attributes and Abilities: the free dots each group got, in group order. */
  groups?: { name: string; spent: number; budget: number }[];
}

export interface CreationCost {
  template: 'vampire' | 'dhampir';
  /** The budget it was held to. */
  budget: Template;
  lines: CreationLine[];
  /** Freebies available: the base, plus flaws up to the cap. */
  freebieBudget: number;
  flawRefund: number;
  freebiesSpent: number;
  /** Negative when over. */
  freebiesLeft: number;
  /** Freebie points over budget; 0 when within it. */
  overBy: number;
  /** Rules broken that freebies can't buy, in words. The Storyteller can still approve these. */
  problems: string[];
  /** Limits nobody can approve past (thin blood's Discipline cap): the server refuses the sheet. */
  blocked: string[];
  /** Within budget and breaking no rule: a player may take a seat without asking. */
  ok: boolean;
  /** Points of the Fourteenth or Fifteenth Generation Flaw a thin-blooded Generation brings (0, 2 or 4), counted with the flaws. */
  thinBloodFlaw: number;
  /** Path rating and Willpower the Virtues give for free. */
  basePath: number;
  baseWillpower: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const named = <T extends { name: string }>(list: T[] | undefined): T[] => (list ?? []).filter((x) => x.name?.trim());

const PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** Gives the largest budget to the group that needs it most: the overflow left, and the budgets each group got. */
function bestFit(spent: number[], budgets: [number, number, number]) {
  let best = { over: Infinity, assigned: [0, 0, 0] };
  for (const p of PERMUTATIONS) {
    const assigned = p.map((i) => budgets[i]);
    const over = sum(spent.map((s, g) => Math.max(0, s - assigned[g])));
    if (over < best.over) best = { over, assigned };
  }
  return best;
}

export function creationCost(sheet: CreationSheet, overrides?: CreationOverrides | null): CreationCost {
  const template = sheet.template === 'dhampir' ? 'dhampir' : 'vampire';
  const budget = budgetKind(sheet);
  const r = rulesFor(budget, overrides);
  const lines: CreationLine[] = [];
  const problems: string[] = [];
  const blocked: string[] = [];

  // Attributes start at one dot each.
  const attrGroups = Object.entries(ATTRIBUTES);
  const attrSpent = attrGroups.map(([, keys]) => sum(keys.map((k) => Math.max(0, (sheet.attributes?.[k] ?? 1) - 1))));
  const attrFit = bestFit(attrSpent, r.attributes);
  lines.push({
    key: 'attributes',
    label: 'Attributes',
    spent: sum(attrSpent),
    budget: sum(r.attributes),
    freebies: attrFit.over * r.cost.attribute,
    groups: attrGroups.map(([name], g) => ({ name, spent: attrSpent[g], budget: attrFit.assigned[g] })),
  });

  // Abilities: dots up to the cap come from the group's budget; above it, freebies.
  const ablGroups = Object.entries(ABILITIES);
  const capped = ablGroups.map(([, keys]) => sum(keys.map((k) => Math.min(r.abilityCap, sheet.abilities?.[k] ?? 0))));
  const aboveCap = sum(ablGroups.flatMap(([, keys]) => keys.map((k) => Math.max(0, (sheet.abilities?.[k] ?? 0) - r.abilityCap))));
  const ablFit = bestFit(capped, r.abilities);
  lines.push({
    key: 'abilities',
    label: 'Abilities',
    spent: sum(capped) + aboveCap,
    budget: sum(r.abilities),
    freebies: (ablFit.over + aboveCap) * r.cost.ability,
    groups: ablGroups.map(([name], g) => ({ name, spent: capped[g], budget: ablFit.assigned[g] })),
  });

  const discSpent = sum(named(sheet.disciplines).map((d) => d.level ?? 0));
  lines.push({ key: 'disciplines', label: 'Disciplines', spent: discSpent, budget: r.disciplines, freebies: Math.max(0, discSpent - r.disciplines) * r.cost.discipline });

  // Generation below 13th is the Generation Background, listed or not.
  const backgrounds = named(sheet.backgrounds);
  const listedGeneration = backgrounds.filter((b) => b.name.trim().toLowerCase() === 'generation').reduce((m, b) => Math.max(m, b.level ?? 0), 0);
  const generationDots = r.generationCosts ? Math.max(LOWEST_GENERATION - (sheet.generation ?? LOWEST_GENERATION), listedGeneration) : 0;
  const otherBackgrounds = sum(backgrounds.filter((b) => b.name.trim().toLowerCase() !== 'generation').map((b) => b.level ?? 0));
  const bgSpent = otherBackgrounds + generationDots;
  lines.push({ key: 'backgrounds', label: 'Backgrounds', spent: bgSpent, budget: r.backgrounds, freebies: Math.max(0, bgSpent - r.backgrounds) * r.cost.background });
  if (generationDots > r.maxGeneration) {
    problems.push(
      r.generationCosts
        ? `Generation ${sheet.generation}th needs ${generationDots} dots of the Generation Background; a new character can have at most ${r.maxGeneration}.`
        : 'A new character of this template can\'t buy Generation.',
    );
  }

  // Virtues start at one dot each.
  const v = sheet.virtues ?? {};
  const virtueValues = Object.values(v);
  const virtueSpent = sum(virtueValues.map((x) => Math.max(0, x - 1)));
  lines.push({ key: 'virtues', label: 'Virtues', spent: virtueSpent, budget: r.virtues, freebies: Math.max(0, virtueSpent - r.virtues) * r.cost.virtue });

  // Humanity or Path starts at the two Virtues it rests on; Willpower at Courage.
  const basePath = (v.conscience ?? v.conviction ?? 1) + (v.selfControl ?? v.instinct ?? 1);
  const baseWillpower = v.courage ?? 1;
  const pathExtra = Math.max(0, (sheet.pathRating ?? basePath) - basePath);
  const wpExtra = Math.max(0, (sheet.willpowerPermanent ?? baseWillpower) - baseWillpower);
  lines.push({ key: 'path', label: 'Humanity or Path', spent: pathExtra, budget: 0, freebies: pathExtra * r.cost.path });
  lines.push({ key: 'willpower', label: 'Willpower', spent: wpExtra, budget: 0, freebies: wpExtra * r.cost.willpower });

  const meritPoints = sum(named(sheet.merits).map((m) => m.points ?? 0));
  lines.push({ key: 'merits', label: 'Merits', spent: meritPoints, budget: 0, freebies: meritPoints });
  if (meritPoints > r.maxMerits) problems.push(`${meritPoints} points of Merits; a new character can have at most ${r.maxMerits}.`);

  // Thin blood is V20's Fourteenth (2 pt) or Fifteenth (4 pt) Generation Flaw:
  // choosing the Generation takes the Flaw, unless it's already listed.
  const generation = sheet.generation ?? LOWEST_GENERATION;
  const flawNames = named(sheet.flaws).map((f) => f.name.trim().toLowerCase());
  const thinName = generation >= 15 ? 'fifteenth generation' : generation === 14 ? 'fourteenth generation' : '';
  const thinBloodFlaw = template === 'vampire' && thinName && !flawNames.includes(thinName) ? (generation >= 15 ? 4 : 2) : 0;
  if (template === 'vampire' && generation >= 14) {
    if (listedGeneration > 0) problems.push('A thin-blooded character can\'t have the Generation Background.');
    if (backgrounds.some((b) => b.name.trim().toLowerCase() === 'status' && (b.level ?? 0) > 0)) problems.push('A thin-blooded character can\'t start with Status.');
    // Time of Thin Blood: the Curse is too weak at 15th Generation to carry a clan,
    // and Insight belongs to the thin-blooded alone (checked below).
    if (generation >= 15 && sheet.clan && sheet.clan.trim().toLowerCase() !== 'caitiff') problems.push('Every 15th-Generation vampire is Caitiff; the blood is too thin to carry a clan.');
    const cap = disciplineCap(generation)!;
    const over = named(sheet.disciplines).filter((d) => (d.level ?? 0) > cap);
    if (over.length) blocked.push(`${generation}th Generation can't hold a Discipline above ${cap}: ${over.map((d) => d.name).join(', ')}.`);
  }

  if (budget !== 'thinBlooded' && backgrounds.some((b) => b.name.trim().toLowerCase() === 'insight' && (b.level ?? 0) > 0)) {
    problems.push('Only the thin-blooded (14th and 15th Generation) can have Insight.');
  }

  const flawPoints = sum(named(sheet.flaws).map((f) => f.points ?? 0)) + thinBloodFlaw;
  const flawRefund = Math.min(flawPoints, r.maxFlaws);

  const freebieBudget = r.freebies + flawRefund;
  const freebiesSpent = sum(lines.map((l) => l.freebies));
  const freebiesLeft = freebieBudget - freebiesSpent;
  const overBy = Math.max(0, -freebiesLeft);
  return {
    template,
    budget,
    lines,
    freebieBudget,
    flawRefund,
    freebiesSpent,
    freebiesLeft,
    overBy,
    problems,
    blocked,
    ok: overBy === 0 && problems.length === 0 && blocked.length === 0,
    thinBloodFlaw,
    basePath,
    baseWillpower,
  };
}

/** One line per section that costs freebies, then the total, for a Storyteller to read at a glance. */
export function describeCost(c: CreationCost): string[] {
  const out = c.lines.filter((l) => l.freebies > 0).map((l) => `${l.label}: ${l.freebies} freebies`);
  const refund = c.flawRefund ? ` (${c.flawRefund} of them from flaws)` : '';
  out.push(`Freebies ${c.freebiesSpent} of ${c.freebieBudget}${refund}${c.overBy ? `, ${c.overBy} over` : ''}`);
  return [...out, ...c.problems];
}
