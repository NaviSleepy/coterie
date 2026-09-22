import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABILITY_KEYS,
  ATTRIBUTE_KEYS,
  buildPool,
  canSpendWillpower,
  traitLabel,
  turnRef,
  virtueForCheck,
  type TraitSheet,
} from '../src/traits.ts';
import { spendBlood } from '../src/blood.ts';

const isolde: TraitSheet = {
  attributes: { dexterity: 3, wits: 3, appearance: 4 },
  abilities: { firearms: 2, performance: 4, subterfuge: 4 },
  virtues: { conscience: 3, selfControl: 3, courage: 2 },
  specialties: [
    { trait: 'performance', text: 'Violin' },
    { trait: 'firearms', text: 'Pistols' },
  ],
  willpowerPermanent: 5,
};

describe('the catalogue', () => {
  it('has nine attributes and thirty abilities', () => {
    assert.equal(ATTRIBUTE_KEYS.length, 9);
    assert.equal(ABILITY_KEYS.length, 30);
  });

  it('labels camelCase keys the way the sheet prints them', () => {
    assert.equal(traitLabel('animalKen'), 'Animal Ken');
    assert.equal(traitLabel('selfControl'), 'Self-Control');
  });
});

describe('building a pool off the sheet', () => {
  it('sums an Attribute and an Ability and orders the label', () => {
    const out = buildPool(isolde, ['firearms', 'dexterity']);
    assert.ok(out.ok);
    if (!out.ok) return;
    assert.equal(out.pool.basePool, 5);
    assert.equal(out.pool.label, 'Dexterity + Firearms');
  });

  it('counts an untrained Ability as zero rather than refusing', () => {
    const out = buildPool(isolde, ['wits', 'occult']);
    assert.ok(out.ok);
    if (out.ok) assert.equal(out.pool.basePool, 3);
  });

  it('refuses two Abilities, two Attributes and unknown keys', () => {
    assert.equal(buildPool(isolde, ['firearms', 'performance']).ok, false);
    assert.equal(buildPool(isolde, ['wits', 'dexterity']).ok, false);
    assert.equal(buildPool(isolde, ['dexterity', 'lockpicking']).ok, false);
    assert.equal(buildPool(isolde, []).ok, false);
    assert.equal(buildPool(isolde, ['wits', 'occult', 'dexterity']).ok, false);
  });

  it('refuses the same trait twice', () => {
    assert.equal(buildPool(isolde, ['dexterity', 'dexterity']).ok, false);
  });

  it('applies a specialty only at four dots', () => {
    const violin = buildPool(isolde, ['appearance', 'performance'], 'performance');
    const pistols = buildPool(isolde, ['dexterity', 'firearms'], 'firearms');
    assert.ok(violin.ok && pistols.ok);
    if (violin.ok) assert.equal(violin.pool.specialtyApplies, true);
    if (pistols.ok) assert.equal(pistols.pool.specialtyApplies, false);
  });

  it('refuses a specialty on a trait that is not being rolled', () => {
    assert.equal(buildPool(isolde, ['dexterity', 'firearms'], 'performance').ok, false);
  });

  it('rolls a lone Virtue or Willpower', () => {
    const courage = buildPool(isolde, ['courage']);
    const wp = buildPool(isolde, ['willpower']);
    assert.ok(courage.ok && wp.ok);
    if (courage.ok) assert.equal(courage.pool.basePool, 2);
    if (wp.ok) assert.equal(wp.pool.basePool, 5);
  });
});

describe('virtue checks', () => {
  it('reads Conscience and Self-Control on Humanity', () => {
    assert.equal(virtueForCheck(isolde.virtues, 'degeneration'), 'conscience');
    assert.equal(virtueForCheck(isolde.virtues, 'frenzy'), 'selfControl');
    assert.equal(virtueForCheck(isolde.virtues, 'rotschreck'), 'courage');
  });

  it('follows the sheet onto a Path of Enlightenment', () => {
    const path = { conviction: 3, instinct: 4, courage: 3 };
    assert.equal(virtueForCheck(path, 'degeneration'), 'conviction');
    assert.equal(virtueForCheck(path, 'frenzy'), 'instinct');
  });
});

describe('willpower, once per turn', () => {
  it('allows a spend on a fresh turn', () => {
    assert.equal(canSpendWillpower(3, 7, 8).ok, true);
  });

  it('refuses a second spend in the same turn', () => {
    assert.equal(canSpendWillpower(3, 8, 8).ok, false);
  });

  it('refuses with nothing left', () => {
    assert.equal(canSpendWillpower(0, -1, 8).ok, false);
  });

  it('does not accumulate outside a scene', () => {
    assert.equal(canSpendWillpower(3, -1, -1).ok, true);
  });
});

describe('turn references', () => {
  it('is chronicle-wide, so scene two turn three is not scene one turn three', () => {
    assert.notEqual(turnRef({ turnBase: 0, turn: 3 }), turnRef({ turnBase: 5, turn: 3 }));
  });

  it('lets the per-turn blood cap reset outside a scene', () => {
    const c = {
      generation: 10,
      health: { bashing: 0, lethal: 0, aggravated: 0 },
      bloodPool: 8,
      willpowerTemporary: 3,
      bloodSpentThisTurn: 1,
      bloodSpentTurnRef: -1,
    };
    assert.equal(spendBlood(c, 1, turnRef(null)).ok, true);
  });
});
