import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { feed, remainingThisTurn, spendBlood, spentThisTurn } from '../src/blood.ts';
import { bloodPerTurn, bloodPoolMax, generationLimits, isValidGeneration } from '../src/generation.ts';
import { EMPTY_TRACK } from '../src/health.ts';
import type { CharacterState } from '../src/types.ts';

const isolde = (over: Partial<CharacterState> = {}): CharacterState => ({
  generation: 10,
  health: EMPTY_TRACK,
  bloodPool: 8,
  willpowerTemporary: 3,
  bloodSpentThisTurn: 0,
  bloodSpentTurnRef: 3,
  ...over,
});

describe('the generation table', () => {
  it('matches the published ceilings', () => {
    assert.deepEqual(generationLimits(13), { bloodPoolMax: 10, bloodPerTurn: 1 });
    assert.deepEqual(generationLimits(10), { bloodPoolMax: 13, bloodPerTurn: 1 });
    assert.deepEqual(generationLimits(9), { bloodPoolMax: 14, bloodPerTurn: 2 });
    assert.deepEqual(generationLimits(4), { bloodPoolMax: 50, bloodPerTurn: 10 });
  });

  it('is monotonic — lower generation is never worse', () => {
    for (let g = 13; g > 4; g--) {
      assert.ok(bloodPoolMax(g - 1) > bloodPoolMax(g));
      assert.ok(bloodPerTurn(g - 1) >= bloodPerTurn(g));
    }
  });

  it('throws on a generation outside the modelled range', () => {
    assert.equal(isValidGeneration(14), false);
    assert.throws(() => generationLimits(14), RangeError);
    assert.throws(() => generationLimits(3), RangeError);
  });

  it('hands back a copy, not the table row', () => {
    const a = generationLimits(10);
    a.bloodPoolMax = 999;
    assert.equal(bloodPoolMax(10), 13);
  });
});

describe('spending blood', () => {
  it('decrements the pool', () => {
    const out = spendBlood(isolde(), 1, 3);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.bloodPool, 7);
    assert.equal(out.remainingThisTurn, 0);
  });

  it('refuses a second point at 10th generation with the mockup copy', () => {
    const out = spendBlood(isolde({ bloodSpentThisTurn: 1, bloodSpentTurnRef: 3 }), 1, 3);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.reason, 'per-turn-cap');
    assert.match(out.message, /1 of 1 blood already spent this turn/);
    assert.match(out.message, /cap resets when the Storyteller advances the turn/);
  });

  it('resets the cap when the Storyteller advances the turn', () => {
    const spent = isolde({ bloodSpentThisTurn: 1, bloodSpentTurnRef: 3 });
    assert.equal(spentThisTurn(spent, 3), 1);
    assert.equal(spentThisTurn(spent, 4), 0);
    assert.equal(remainingThisTurn(spent, 4), 1);

    const out = spendBlood(spent, 1, 4);
    assert.equal(out.ok, true);
  });

  it('lets a 9th generation elder draw two in one turn but not three', () => {
    const ceren = isolde({ generation: 9, bloodPool: 12, bloodSpentTurnRef: 3 });
    const first = spendBlood(ceren, 2, 3);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.remainingThisTurn, 0);

    const second = spendBlood(
      { ...ceren, bloodPool: first.bloodPool, bloodSpentThisTurn: first.bloodSpentThisTurn },
      1,
      3,
    );
    assert.equal(second.ok, false);
  });

  it('explains a partial refusal rather than truncating the spend', () => {
    const dmitri = isolde({ generation: 8, bloodSpentThisTurn: 2, bloodSpentTurnRef: 3 });
    const out = spendBlood(dmitri, 2, 3);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.match(out.message, /Only 1 of 3 blood left/);
  });

  it('refuses to spend blood that isn\'t in the pool', () => {
    const out = spendBlood(isolde({ generation: 8, bloodPool: 1 }), 3, 3);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.reason, 'insufficient-blood');
  });

  it('rejects zero and fractional amounts', () => {
    assert.equal(spendBlood(isolde(), 0, 3).ok, false);
    assert.equal(spendBlood(isolde(), 1.5, 3).ok, false);
    assert.equal(spendBlood(isolde(), -2, 3).ok, false);
  });

  it('raises the hunger frenzy flag at exactly zero', () => {
    const out = spendBlood(isolde({ bloodPool: 1 }), 1, 3);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.bloodPool, 0);
    assert.equal(out.hungerFrenzy, true);
  });

  it('does not raise it on the way down', () => {
    const out = spendBlood(isolde({ bloodPool: 2 }), 1, 3);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.hungerFrenzy, false);
  });
});

describe('feeding', () => {
  it('fills to the generation ceiling and reports the overflow', () => {
    const out = feed(isolde({ bloodPool: 11 }), 5);
    assert.equal(out.bloodPool, 13);
    assert.equal(out.gained, 2);
    assert.equal(out.overflow, 3);
  });

  it('does nothing at a full pool', () => {
    const out = feed(isolde({ bloodPool: 13 }), 4);
    assert.equal(out.gained, 0);
    assert.equal(out.overflow, 4);
  });
});
