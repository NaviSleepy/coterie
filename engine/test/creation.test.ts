import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { creationCost } from '../src/index.ts';

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
});
