import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cleanCreationOverrides, creationCost, rulesFor } from '../src/index.ts';

const attrs = (o: Record<string, number>) => ({ strength: 1, dexterity: 1, stamina: 1, charisma: 1, manipulation: 1, appearance: 1, perception: 1, intelligence: 1, wits: 1, ...o });
const base = { virtues: { conscience: 3, selfControl: 3, courage: 4 }, pathRating: 6, willpowerPermanent: 4 };

describe('character creation budget', () => {
  it('fits a by-the-book vampire with nothing left over to pay', () => {
    const c = creationCost({
      ...base,
      generation: 13,
      attributes: attrs({ strength: 3, dexterity: 4, stamina: 3, charisma: 3, manipulation: 2, appearance: 2, perception: 2, intelligence: 2, wits: 1 }),
      abilities: { alertness: 3, athletics: 3, brawl: 3, empathy: 2, firearms: 3, melee: 3, stealth: 3, investigation: 2, occult: 2, law: 1 },
      disciplines: [{ name: 'Celerity', level: 2 }, { name: 'Potence', level: 1 }],
      backgrounds: [{ name: 'Resources', level: 3 }, { name: 'Contacts', level: 2 }],
    });
    assert.equal(c.freebiesSpent, 0);
    assert.equal(c.freebiesLeft, 15);
    assert.ok(c.ok);
  });

  it('picks the cheapest priorities and charges the overflow at book cost', () => {
    // Physical 8, Social 5, Mental 3: one Attribute dot over, whatever the order.
    const c = creationCost({ ...base, attributes: attrs({ strength: 4, dexterity: 4, stamina: 3, charisma: 3, manipulation: 3, appearance: 2, perception: 2, intelligence: 2, wits: 2 }) });
    assert.equal(c.lines.find((l) => l.key === 'attributes')!.freebies, 5);
  });

  it('charges Abilities above three as freebies, and Disciplines at seven', () => {
    const c = creationCost({ ...base, abilities: { brawl: 5 }, disciplines: [{ name: 'Potence', level: 4 }] });
    assert.equal(c.lines.find((l) => l.key === 'abilities')!.freebies, 4);
    assert.equal(c.lines.find((l) => l.key === 'disciplines')!.freebies, 7);
  });

  it('counts lower Generation as Background dots and refuses more than five', () => {
    const c = creationCost({ ...base, generation: 10, backgrounds: [{ name: 'Herd', level: 3 }] });
    assert.equal(c.lines.find((l) => l.key === 'backgrounds')!.spent, 6);
    assert.equal(c.lines.find((l) => l.key === 'backgrounds')!.freebies, 1);
    const deep = creationCost({ ...base, generation: 7 });
    assert.equal(deep.problems.length, 1);
    assert.equal(deep.ok, false);
  });

  it('gives Humanity and Willpower from the Virtues and charges anything above', () => {
    const c = creationCost({ virtues: { conscience: 2, selfControl: 2, courage: 2 }, pathRating: 7, willpowerPermanent: 5 });
    assert.equal(c.basePath, 4);
    assert.equal(c.lines.find((l) => l.key === 'path')!.freebies, 3);
    assert.equal(c.lines.find((l) => l.key === 'willpower')!.freebies, 3);
  });

  it('refunds flaws up to seven and goes over when merits outrun the freebies', () => {
    const c = creationCost({ ...base, merits: [{ name: 'Iron Will', points: 3 }], flaws: [{ name: 'Nightmares', points: 1 }, { name: 'Prey Exclusion', points: 9 }] });
    assert.equal(c.flawRefund, 7);
    assert.equal(c.freebieBudget, 22);
    const over = creationCost({ ...base, abilities: { brawl: 5, firearms: 5, melee: 5, stealth: 5 }, disciplines: [{ name: 'Celerity', level: 5 }] });
    assert.ok(over.overBy > 0);
    assert.equal(over.ok, false);
  });

  it('uses Accursed Heirs numbers for dhampirs', () => {
    const c = creationCost({ ...base, template: 'dhampir', generation: 8, disciplines: [{ name: 'Potence', level: 1 }, { name: 'Celerity', level: 2 }] });
    assert.equal(c.freebieBudget, 18);
    assert.equal(c.lines.find((l) => l.key === 'disciplines')!.freebies, 10);
    assert.equal(c.lines.find((l) => l.key === 'backgrounds')!.spent, 0, 'Generation costs nothing');
  });

  it("uses a campaign's own numbers in place of the book's", () => {
    const sheet = { ...base, disciplines: [{ name: 'Celerity', level: 4 }], abilities: { brawl: 4 } };
    assert.equal(creationCost(sheet).overBy, 0);
    assert.equal(creationCost(sheet).freebiesSpent, 9);
    const generous = { vampire: { disciplines: 4, abilityCap: 4, freebies: 21 } };
    const c = creationCost(sheet, generous);
    assert.equal(c.freebiesSpent, 0);
    assert.equal(c.freebieBudget, 21);
    const stingy = creationCost(sheet, { vampire: { freebies: 5, cost: { discipline: 10 } } });
    assert.equal(stingy.lines.find((l) => l.key === 'disciplines')!.freebies, 10);
    assert.ok(stingy.overBy > 0);
    assert.equal(rulesFor('dhampir', generous).freebies, 18, 'other templates keep the book');
  });

  it('cleans overrides and refuses nonsense', () => {
    assert.deepEqual(cleanCreationOverrides({ vampire: { attributes: [8, 6, 4], cost: { attribute: 4 } } }), { vampire: { attributes: [8, 6, 4], cost: { attribute: 4 } } });
    assert.deepEqual(cleanCreationOverrides(null), {});
    assert.throws(() => cleanCreationOverrides({ vampire: { freebies: 1000 } }));
    assert.throws(() => cleanCreationOverrides({ vampire: { attributes: [7, 5] } }));
    assert.throws(() => cleanCreationOverrides({ ghoul: {} }));
    assert.throws(() => cleanCreationOverrides({ vampire: { generationCosts: false } }));
    assert.throws(() => cleanCreationOverrides({ vampire: { cost: { flight: 1 } } }));
  });

  it('counts a thin-blooded Generation as its Flaw, once, and holds it to the thin-blood limits', () => {
    const fourteenth = creationCost({ ...base, generation: 14 });
    assert.equal(fourteenth.thinBloodFlaw, 2);
    assert.equal(fourteenth.freebieBudget, 20, 'Time of Thin Blood: 18, plus the Flaw');
    const listed = creationCost({ ...base, generation: 15, flaws: [{ name: 'Fifteenth Generation', points: 4 }] });
    assert.equal(listed.thinBloodFlaw, 0);
    assert.equal(listed.freebieBudget, 22, 'listed once, not twice');
    const capped = creationCost({ ...base, generation: 15, flaws: [{ name: 'Thin Blood', points: 4 }] });
    assert.equal(capped.flawRefund, 7, 'still under the seven-point cap');
    const rules = creationCost({ ...base, generation: 15, disciplines: [{ name: 'Obfuscate', level: 4 }], backgrounds: [{ name: 'Generation', level: 1 }, { name: 'Status', level: 1 }] });
    assert.equal(rules.problems.length, 2);
    assert.equal(rules.blocked.length, 1);
    assert.equal(creationCost({ ...base, generation: 15, template: 'dhampir' }).thinBloodFlaw, 0);
  });

  it('holds the thin-blooded to Time of Thin Blood\'s budget: 6/5/3, 12/8/5, two Disciplines at ten, 18 freebies', () => {
    const c = creationCost({ ...base, generation: 14, disciplines: [{ name: 'Celerity', level: 3 }], attributes: attrs({ strength: 4, dexterity: 4 }) });
    assert.equal(c.budget, 'thinBlooded');
    assert.equal(c.lines.find((l) => l.key === 'attributes')!.budget, 14);
    assert.equal(c.lines.find((l) => l.key === 'disciplines')!.freebies, 10);
    assert.equal(c.freebieBudget, 20, '18 plus the 2-point Flaw');
    assert.equal(creationCost({ ...base, generation: 13 }).budget, 'vampire');
    assert.equal(creationCost({ ...base, generation: 15, template: 'dhampir' }).budget, 'dhampir');
  });

  it('makes every 15th-Generation vampire Caitiff and keeps Insight for the thin-blooded', () => {
    assert.ok(creationCost({ ...base, generation: 15, clan: 'Toreador' }).problems.some((p) => /Caitiff/.test(p)));
    assert.equal(creationCost({ ...base, generation: 15, clan: 'Caitiff' }).problems.length, 0);
    assert.equal(creationCost({ ...base, generation: 14, clan: 'Toreador' }).problems.length, 0);
    assert.ok(creationCost({ ...base, generation: 12, backgrounds: [{ name: 'Insight', level: 2 }] }).problems.some((p) => /Insight/.test(p)));
    assert.equal(creationCost({ ...base, generation: 15, backgrounds: [{ name: 'Insight', level: 2 }] }).problems.length, 0);
  });

  it('lets a campaign change the thin-blooded budget on its own', () => {
    assert.deepEqual(cleanCreationOverrides({ thinBlooded: { freebies: 21 } }), { thinBlooded: { freebies: 21 } });
    assert.equal(creationCost({ ...base, generation: 15 }, { thinBlooded: { freebies: 21 } }).freebieBudget, 25);
  });
});
