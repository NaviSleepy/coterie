import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BOTCH_RULE,
  MAX_REROLL_DEPTH,
  cryptoDie,
  redactForTable,
  rollPool,
  scriptedDice,
} from '../src/dice.ts';
import { EMPTY_TRACK } from '../src/health.ts';
import type { HealthTrack } from '../src/types.ts';

const healthy = { health: EMPTY_TRACK, willpowerTemporary: 5 };
const hurt = (t: Partial<HealthTrack>) => ({
  health: { ...EMPTY_TRACK, ...t },
  willpowerTemporary: 5,
});

describe('success counting', () => {
  it('counts dice at or above the difficulty', () => {
    const r = rollPool(
      { basePool: 5, difficulty: 6 },
      { character: healthy, die: scriptedDice([6, 7, 5, 10, 2]) },
    );
    assert.equal(r.rawSuccesses, 3);
    assert.equal(r.ones, 0);
    assert.equal(r.netSuccesses, 3);
    assert.equal(r.outcome, 'success');
  });

  it('subtracts one success per die showing 1', () => {
    const r = rollPool(
      { basePool: 4, difficulty: 6 },
      { character: healthy, die: scriptedDice([9, 8, 1, 3]) },
    );
    assert.equal(r.rawSuccesses, 2);
    assert.equal(r.ones, 1);
    assert.equal(r.netSuccesses, 1);
    assert.equal(r.outcome, 'success');
  });

  it('clamps difficulty into the 2–10 band', () => {
    const low = rollPool({ basePool: 1, difficulty: -4 }, { character: healthy, die: scriptedDice([2]) });
    const high = rollPool({ basePool: 1, difficulty: 44 }, { character: healthy, die: scriptedDice([10]) });
    assert.equal(low.difficulty, 2);
    assert.equal(high.difficulty, 10);
    assert.equal(high.outcome, 'success');
  });
});

describe('botch', () => {
  it('botches when ones take the net below zero', () => {
    const r = rollPool(
      { basePool: 4, difficulty: 6 },
      { character: healthy, die: scriptedDice([7, 1, 1, 4]) },
    );
    assert.equal(r.netSuccesses, -1);
    assert.equal(r.outcome, 'botch');
  });

  it('treats cancelled-to-zero as a botch under the default house rule', () => {
    const r = rollPool(
      { basePool: 3, difficulty: 6 },
      { character: healthy, die: scriptedDice([8, 1, 4]) },
    );
    assert.equal(r.netSuccesses, 0);
    assert.equal(r.botchRule, DEFAULT_BOTCH_RULE);
    assert.equal(r.outcome, 'botch');
  });

  it('treats cancelled-to-zero as an ordinary failure under the other rule', () => {
    const r = rollPool(
      { basePool: 3, difficulty: 6, botchRule: 'only-negative-is-a-botch' },
      { character: healthy, die: scriptedDice([8, 1, 4]) },
    );
    assert.equal(r.netSuccesses, 0);
    assert.equal(r.outcome, 'failure');
  });

  it('is a plain failure at zero successes with no ones', () => {
    const r = rollPool(
      { basePool: 3, difficulty: 8 },
      { character: healthy, die: scriptedDice([7, 2, 4]) },
    );
    assert.equal(r.outcome, 'failure');
  });
});

describe('specialties', () => {
  it('rerolls tens cumulatively', () => {
    // 10 → 10 → 7. Three dice on the sheet from one die in the pool.
    const r = rollPool(
      { basePool: 1, difficulty: 6, specialtyApplies: true },
      { character: healthy, die: scriptedDice([10, 10, 7, 2, 2, 2, 2]) },
    );
    assert.equal(r.dice.length, 3);
    assert.equal(r.rawSuccesses, 3);
    assert.deepEqual(
      r.dice.map((d) => d.rerolled),
      [false, true, true],
    );
  });

  it('does not reroll without a specialty', () => {
    const r = rollPool(
      { basePool: 1, difficulty: 6 },
      { character: healthy, die: scriptedDice([10, 10, 10]) },
    );
    assert.equal(r.dice.length, 1);
  });

  it('caps the reroll chain so a pathological pool cannot hang the Function', () => {
    const r = rollPool(
      { basePool: 1, difficulty: 6, specialtyApplies: true },
      { character: healthy, die: scriptedDice([10]) }, // every die is a ten, forever
    );
    assert.equal(r.dice.length, MAX_REROLL_DEPTH + 1);
    assert.equal(r.dice.at(-1)?.fromSpecialty, false);
  });

  it('lets a one on a reroll subtract like any other', () => {
    const r = rollPool(
      { basePool: 2, difficulty: 6, specialtyApplies: true },
      { character: healthy, die: scriptedDice([10, 4, 1]) },
    );
    assert.equal(r.rawSuccesses, 1);
    assert.equal(r.ones, 1);
    assert.equal(r.netSuccesses, 0);
  });
});

describe('willpower', () => {
  it('adds one automatic success after the dice resolve', () => {
    const r = rollPool(
      { basePool: 3, difficulty: 8, spendWillpower: true },
      { character: healthy, die: scriptedDice([2, 3, 4]) },
    );
    assert.equal(r.rawSuccesses, 0);
    assert.equal(r.netSuccesses, 1);
    assert.equal(r.outcome, 'success');
    assert.equal(r.willpowerSpent, true);
  });

  it('cannot turn a botch into a success — the botch still lands', () => {
    const r = rollPool(
      { basePool: 3, difficulty: 8, spendWillpower: true },
      { character: healthy, die: scriptedDice([1, 1, 9]) },
    );
    assert.equal(r.outcome, 'botch');
    assert.equal(r.netSuccesses, -1);
    assert.equal(r.willpowerSpent, true);
  });

  it('is not spent when the pool is empty', () => {
    const r = rollPool(
      { basePool: 3, difficulty: 6, spendWillpower: true },
      { character: { health: EMPTY_TRACK, willpowerTemporary: 0 }, die: scriptedDice([2, 2, 2]) },
    );
    assert.equal(r.willpowerSpent, false);
    assert.equal(r.outcome, 'failure');
  });
});

describe('wound penalties', () => {
  it('reads the penalty from the character rather than the request', () => {
    const r = rollPool(
      { basePool: 5, difficulty: 6 },
      { character: hurt({ lethal: 4 }), die: scriptedDice([9, 9, 9, 9, 9]) },
    );
    assert.equal(r.woundPenalty, 2); // Wounded
    assert.equal(r.pool, 3);
    assert.equal(r.dice.length, 3);
  });

  it('refuses the roll when wounds eat the whole pool', () => {
    const r = rollPool(
      { basePool: 2, difficulty: 6 },
      { character: hurt({ lethal: 6 }), die: scriptedDice([10, 10]) },
    );
    assert.equal(r.pool, 0);
    assert.equal(r.dice.length, 0);
    assert.equal(r.outcome, 'failure');
    assert.match(r.refusal ?? '', /Wounds took the pool to nothing/);
  });

  it('refuses outright when the character is incapacitated', () => {
    const r = rollPool(
      { basePool: 8, difficulty: 6 },
      { character: hurt({ lethal: 7 }), die: scriptedDice([10]) },
    );
    assert.match(r.refusal ?? '', /Incapacitated/);
    assert.equal(r.dice.length, 0);
  });

  it('applies a positive modifier after the penalty', () => {
    const r = rollPool(
      { basePool: 4, difficulty: 6, modifier: 2 },
      { character: hurt({ bashing: 2 }), die: scriptedDice([2]) },
    );
    assert.equal(r.woundPenalty, 1);
    assert.equal(r.pool, 5);
  });
});

describe('disclosure', () => {
  it('strips the difficulty rather than blanking it', () => {
    const r = rollPool({ basePool: 2, difficulty: 7 }, { character: healthy, die: scriptedDice([9, 9]) });
    const table = redactForTable(r);
    assert.equal('difficulty' in table, false);
    assert.equal(r.difficulty, 7);
  });

  it('defaults to a table-visible roll', () => {
    const r = rollPool({ basePool: 1, difficulty: 6 }, { character: healthy, die: scriptedDice([5]) });
    assert.equal(r.visibility, 'table');
  });
});

describe('the RNG', () => {
  it('only ever produces 1 through 10', () => {
    for (let i = 0; i < 20000; i++) {
      const v = cryptoDie();
      assert.ok(v >= 1 && v <= 10, `out of range: ${v}`);
      assert.ok(Number.isInteger(v));
    }
  });

  it('is not visibly biased across faces', () => {
    const counts = new Array(11).fill(0);
    const n = 120000;
    for (let i = 0; i < n; i++) counts[cryptoDie()]++;
    const expected = n / 10;
    for (let face = 1; face <= 10; face++) {
      const drift = Math.abs(counts[face] - expected) / expected;
      assert.ok(drift < 0.04, `face ${face} drifted ${(drift * 100).toFixed(2)}%`);
    }
  });
});

describe('golden rolls from the mockup feed', () => {
  it('Ceren · Wits + Occult · difficulty 6 · botch', () => {
    const r = rollPool(
      { basePool: 4, difficulty: 6, label: 'Wits + Occult' },
      { character: healthy, die: scriptedDice([1, 1, 4, 7]) },
    );
    assert.equal(r.outcome, 'botch');
    assert.equal(r.ones, 2);
    assert.equal(r.rawSuccesses, 1);
  });

  it('Dmitri · Strength + Brawl · difficulty 6 · 4 successes', () => {
    const r = rollPool(
      { basePool: 6, difficulty: 6, label: 'Strength + Brawl' },
      { character: healthy, die: scriptedDice([9, 7, 2, 6, 10, 4]) },
    );
    assert.equal(r.netSuccesses, 4);
    assert.equal(r.outcome, 'success');
  });

  it('Isolde · Dexterity + Firearms · pool 5 less one wound · 1 success', () => {
    const r = rollPool(
      { basePool: 5, difficulty: 7, label: 'Dexterity + Firearms' },
      { character: hurt({ bashing: 2 }), die: scriptedDice([8, 10, 3, 1]) },
    );
    assert.equal(r.woundPenalty, 1);
    assert.equal(r.pool, 4);
    assert.equal(r.netSuccesses, 1);
    assert.equal(r.outcome, 'success');
  });
});
