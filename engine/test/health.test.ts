import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_TRACK,
  applyDamage,
  healDamage,
  isIncapacitated,
  trackBoxes,
  woundLevel,
  woundPenalty,
} from '../src/health.ts';
import type { HealthTrack } from '../src/types.ts';

const track = (t: Partial<HealthTrack>): HealthTrack => ({ ...EMPTY_TRACK, ...t });

describe('wound penalties', () => {
  it('matches the V20 ladder', () => {
    const ladder = [0, 0, 1, 1, 2, 2, 5, 5];
    for (let boxes = 0; boxes <= 7; boxes++) {
      assert.equal(woundPenalty(track({ bashing: boxes })), ladder[boxes], `${boxes} boxes`);
    }
  });

  it('names the deepest marked level', () => {
    assert.equal(woundLevel(EMPTY_TRACK), undefined);
    assert.equal(woundLevel(track({ bashing: 1 })), 'Bruised');
    assert.equal(woundLevel(track({ lethal: 2, bashing: 2 })), 'Wounded');
    assert.equal(woundLevel(track({ aggravated: 7 })), 'Incapacitated');
  });

  it('counts all three damage types against the same seven boxes', () => {
    const t = track({ bashing: 2, lethal: 2, aggravated: 1 });
    assert.equal(woundPenalty(t), 2); // Mauled
    assert.equal(isIncapacitated(t), false);
  });
});

describe('the rendered track', () => {
  it('sorts worst damage to the top', () => {
    const boxes = trackBoxes(track({ bashing: 2, lethal: 1, aggravated: 1 }));
    assert.deepEqual(boxes, [
      'aggravated',
      'lethal',
      'bashing',
      'bashing',
      null,
      null,
      null,
    ]);
  });

  it('is always seven cells long', () => {
    assert.equal(trackBoxes(EMPTY_TRACK).length, 7);
    assert.equal(trackBoxes(track({ lethal: 99 })).length, 7);
  });
});

describe('applying damage', () => {
  it('fills empty boxes first', () => {
    const out = applyDamage(EMPTY_TRACK, 3, 'lethal');
    assert.deepEqual(out.track, track({ lethal: 3 }));
    assert.equal(out.marked, 3);
    assert.equal(out.upgraded, 0);
  });

  it('composes as a delta', () => {
    let t = EMPTY_TRACK;
    t = applyDamage(t, 2, 'bashing').track;
    t = applyDamage(t, 3, 'bashing').track;
    assert.equal(t.bashing, 5);
  });

  it('upgrades bashing to lethal when bashing overflows', () => {
    const full = track({ bashing: 7 });
    const out = applyDamage(full, 2, 'bashing');
    assert.deepEqual(out.track, track({ bashing: 5, lethal: 2 }));
    assert.equal(out.marked, 0);
    assert.equal(out.upgraded, 2);
  });

  it('lets overflowing lethal eat bashing before it makes aggravated', () => {
    // Three points convert the bashing; the fourth has nothing softer left and
    // escalates a lethal box instead of vanishing.
    const out = applyDamage(track({ bashing: 3, lethal: 4 }), 4, 'lethal');
    assert.deepEqual(out.track, track({ bashing: 0, lethal: 6, aggravated: 1 }));
    assert.equal(out.upgraded, 4);
    assert.equal(out.discarded, 0);
  });

  it('turns lethal into aggravated when nothing softer is left', () => {
    const out = applyDamage(track({ lethal: 7 }), 2, 'lethal');
    assert.deepEqual(out.track, track({ lethal: 5, aggravated: 2 }));
  });

  it('lets aggravated escalate lethal first, then bashing', () => {
    const out = applyDamage(track({ bashing: 3, lethal: 4 }), 5, 'aggravated');
    assert.deepEqual(out.track, track({ bashing: 2, lethal: 0, aggravated: 5 }));
  });

  it('discards damage that has nothing left to escalate', () => {
    const out = applyDamage(track({ aggravated: 7 }), 3, 'bashing');
    assert.deepEqual(out.track, track({ aggravated: 7 }));
    assert.equal(out.discarded, 3);
  });

  it('reports the crossing into incapacitated exactly once', () => {
    const first = applyDamage(track({ lethal: 5 }), 2, 'lethal');
    assert.equal(first.newlyIncapacitated, true);
    const second = applyDamage(first.track, 1, 'lethal');
    assert.equal(second.newlyIncapacitated, false);
    assert.equal(second.incapacitated, true);
  });

  it('accepts a negative delta as a Storyteller correction', () => {
    const out = applyDamage(track({ bashing: 3 }), -2, 'bashing');
    assert.equal(out.track.bashing, 1);
  });

  it('rejects fractional damage', () => {
    assert.throws(() => applyDamage(EMPTY_TRACK, 1.5, 'lethal'), TypeError);
  });
});

describe('healing', () => {
  it('spends one blood per bashing or lethal box', () => {
    const out = healDamage(track({ lethal: 3 }), 2, 'lethal', 5);
    assert.equal(out.healed, 2);
    assert.equal(out.bloodSpent, 2);
    assert.equal(out.track.lethal, 1);
  });

  it('charges five blood a box for aggravated', () => {
    const out = healDamage(track({ aggravated: 2 }), 2, 'aggravated', 12);
    assert.equal(out.healed, 2);
    assert.equal(out.bloodSpent, 10);
  });

  it('heals only what the blood affords', () => {
    const out = healDamage(track({ aggravated: 2 }), 2, 'aggravated', 7);
    assert.equal(out.healed, 1);
    assert.equal(out.bloodSpent, 5);
    assert.equal(out.track.aggravated, 1);
  });

  it('never heals damage that isn\'t there', () => {
    const out = healDamage(track({ lethal: 1 }), 4, 'lethal', 10);
    assert.equal(out.healed, 1);
    assert.equal(out.track.lethal, 0);
  });
});
