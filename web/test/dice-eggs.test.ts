import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { eggOf } from '../src/lib/dice-eggs.ts';

const roll = (values: number[], outcome = 'success', netSuccesses = 0) => ({ dice: values.map((value) => ({ value })), outcome, netSuccesses });

describe('dice eggs', () => {
  it('purrs on three or more tens, and only then', () => {
    assert.equal(eggOf(roll([10, 10, 10], 'success', 3))?.kind, 'purr');
    assert.equal(eggOf(roll([10, 10], 'success', 2)), null, 'two tens is luck, not an egg');
    assert.equal(eggOf(roll([10, 10, 9], 'success', 3)), null);
  });

  it('cuts the lights on a botch of nothing but ones', () => {
    assert.equal(eggOf(roll([1, 1, 1], 'botch', -3))?.kind, 'dark');
    assert.equal(eggOf(roll([1], 'botch', -1)), null, 'a single one is ordinary misery');
    assert.equal(eggOf(roll([1, 1, 4], 'botch', -2)), null);
  });

  it('whispers at exactly thirteen', () => {
    assert.equal(eggOf(roll(Array(14).fill(8), 'success', 13))?.kind, 'thirteen');
    assert.equal(eggOf(roll(Array(14).fill(8), 'success', 12)), null);
  });

  it('never hatches on a refused roll', () => {
    assert.equal(eggOf({ ...roll([10, 10, 10]), refusal: 'Incapacitated' }), null);
  });
});
