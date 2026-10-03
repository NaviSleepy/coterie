import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handler as applyDamage } from '../src/fns/applyDamage.ts';
import { handler as feedAndHeal } from '../src/fns/feedAndHeal.ts';
import { handler as scene } from '../src/fns/scene.ts';
import { handler as spendBlood } from '../src/fns/spendBlood.ts';
import { ledgerId } from '../src/shared/mutate.ts';
import { ashenCourt, CHRONICLE, DMITRI, DMITRI_PLAYER, ISOLDE, ISOLDE_PLAYER, rejects, ST } from './fake.ts';

describe('compare-and-swap through the ledger', () => {
  it('composes a player and the ST marking the same attack at the same moment', async () => {
    const w = ashenCourt();
    // The player's write reads version 0, then — before it commits — the ST's
    // write lands. The player's ledger row `….v1` now collides; the database
    // refuses it, the Function re-reads version 1 and recomputes.
    w.tables.beforeCommit = () =>
      applyDamage(w.as(ST), { characterId: DMITRI, amount: 3, type: 'lethal' }).then(() => {});
    await applyDamage(w.as(DMITRI_PLAYER), { characterId: DMITRI, amount: 2, type: 'lethal' });

    const c = w.tables.row('characters', DMITRI)!;
    assert.equal(c.healthLethal, 5, 'both deltas landed; nobody died who shouldn\'t have');
    assert.equal(c.version, 2);
    assert.equal(w.tables.conflicts, 1);
    assert.ok(w.tables.row('ledger', ledgerId(DMITRI, 1)));
    assert.ok(w.tables.row('ledger', ledgerId(DMITRI, 2)));
  });

  it('leaves nothing behind when a commit loses', async () => {
    const w = ashenCourt();
    w.tables.beforeCommit = () =>
      spendBlood(w.as(ST), { characterId: DMITRI, amount: 1, reason: 'race' }).then(() => {});
    // Dmitri is 11th generation: one point a turn. The ST's spend wins the
    // race, so the retry sees the cap already used and refuses.
    await rejects(spendBlood(w.as(DMITRI_PLAYER), { characterId: DMITRI, amount: 1 }), 422, 'per-turn-cap');
    const c = w.tables.row('characters', DMITRI)!;
    assert.equal(c.bloodPool, 3);
    assert.equal(c.version, 1);
    assert.equal(w.tables.rows('ledger').length, 1);
  });

  it('keeps the ledger readable only behind the screen', async () => {
    const w = ashenCourt();
    await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    assert.deepEqual(w.tables.row('ledger', ledgerId(ISOLDE, 1))!.$permissions, ['read("team:team_ashen/storyteller")']);
  });
});

describe('spendBlood', () => {
  it('spends and reports what is left this turn', async () => {
    const w = ashenCourt();
    const out: any = await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1, reason: 'Celerity' });
    assert.equal(out.bloodPool, 7);
    assert.equal(out.remainingThisTurn, 0);
  });

  it('refuses past the generation cap with copy the UI shows verbatim', async () => {
    const w = ashenCourt();
    await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    const e = await rejects(spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 }), 422, 'per-turn-cap');
    assert.match(e.message, /1 of 1 blood already spent this turn/);
  });

  it('resets the cap when the ST advances the turn, and only then', async () => {
    const w = ashenCourt();
    await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    await scene(w.as(ST), { action: 'advance', chronicleId: CHRONICLE });
    const out: any = await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    assert.equal(out.bloodPool, 6);
  });

  it('keeps the cap across scenes: a new scene\'s turn 1 is not the old scene\'s turn 1', async () => {
    const w = ashenCourt();
    await scene(w.as(ST), { action: 'start', chronicleId: CHRONICLE, name: 'Elysium' });
    await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    await scene(w.as(ST), { action: 'start', chronicleId: CHRONICLE, name: 'The Docks' });
    const out: any = await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    assert.equal(out.bloodPool, 6);
  });

  it('raises the hunger frenzy flag at zero', async () => {
    const w = ashenCourt();
    w.tables.seed('characters', ISOLDE, { ...w.tables.row('characters', ISOLDE), bloodPool: 1 });
    const out: any = await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    assert.equal(out.hungerFrenzy, true);
  });

  it("refuses another player's pool", async () => {
    const w = ashenCourt();
    await rejects(spendBlood(w.as(DMITRI_PLAYER), { characterId: ISOLDE, amount: 1 }), 403);
  });
});

describe('applyDamage', () => {
  it('marks damage and reports the new penalty', async () => {
    const w = ashenCourt();
    const out: any = await applyDamage(w.as(ST), { characterId: ISOLDE, amount: 2, type: 'lethal' });
    assert.equal(out.woundLevel, 'Wounded');
    assert.equal(out.woundPenalty, 2);
  });

  it('lets only the Storyteller un-mark', async () => {
    const w = ashenCourt();
    await rejects(applyDamage(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: -1, type: 'lethal' }), 403);
    const out: any = await applyDamage(w.as(ST), { characterId: ISOLDE, amount: -1, type: 'lethal' });
    assert.equal(out.health.lethal, 0);
  });
});

describe('feedAndHeal', () => {
  it('lets only the Storyteller add blood', async () => {
    const w = ashenCourt();
    await rejects(feedAndHeal(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, bloodGained: 5 }), 403);
    const out: any = await feedAndHeal(w.as(ST), { characterId: ISOLDE, bloodGained: 10 });
    assert.equal(out.bloodPool, 13);
    assert.equal(out.overflow, 5);
  });

  it('heals lethal first, one blood a box, inside the per-turn cap', async () => {
    const w = ashenCourt();
    const out: any = await feedAndHeal(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, heal: 2 });
    assert.deepEqual(out.healed, { lethal: 1, bashing: 0, aggravated: 0 }, '10th generation: one blood this turn');
    assert.equal(out.bloodPool, 7);
    await rejects(feedAndHeal(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, heal: 1 }), 422, 'per-turn-cap');
  });

  it('keeps aggravated healing behind the screen', async () => {
    const w = ashenCourt();
    await rejects(feedAndHeal(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, healAggravated: 1 }), 403);
  });
});

describe('thin blood', () => {
  const thin = (w: any, generation: number, over: Record<string, unknown> = {}) =>
    w.tables.seed('characters', ISOLDE, { ...w.tables.row('characters', ISOLDE), generation, bloodPoolMax: 10, bloodPerTurn: 1, ...over });

  it('keeps the last two points of a 14th-Generation pool for rising', async () => {
    const w = ashenCourt();
    thin(w, 14, { bloodPool: 3 });
    await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    assert.equal(w.tables.row('characters', ISOLDE)!.bloodPool, 2);
    w.tables.seed('characters', ISOLDE, { ...w.tables.row('characters', ISOLDE), bloodSpentTurnRef: -1, bloodSpentThisTurn: 0 });
    await rejects(spendBlood(w.as(ST), { characterId: ISOLDE, amount: 1 }), 422, 'thin-blood-reserve');
  });

  it('charges a 15th-Generation vampire double, for spending and for healing', async () => {
    const w = ashenCourt();
    thin(w, 15, { bloodPool: 10, healthLethal: 2, healthBashing: 0, healthAggravated: 0 });
    const out: any = await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    assert.equal(out.bloodPool, 8);
    assert.equal(out.spent, 2);
    // A new turn's worth: heal one lethal for two blood.
    w.tables.seed('characters', ISOLDE, { ...w.tables.row('characters', ISOLDE), bloodSpentTurnRef: -1, bloodSpentThisTurn: 0 });
    await feedAndHeal(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, heal: 1 });
    const c = w.tables.row('characters', ISOLDE)!;
    assert.equal(c.healthLethal, 1);
    assert.equal(c.bloodPool, 6);
    // Six left, four of them reserved: one more point of effect, then nothing.
    w.tables.seed('characters', ISOLDE, { ...c, bloodSpentTurnRef: -1, bloodSpentThisTurn: 0, bloodPool: 5 });
    await rejects(feedAndHeal(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, heal: 1 }), 422, 'thin-blood-reserve');
  });

  it('doubles costs for the Thin Blood Flaw at any Generation', async () => {
    const w = ashenCourt();
    w.tables.seed('characters', ISOLDE, { ...w.tables.row('characters', ISOLDE), bloodPool: 6, flaws: JSON.stringify([{ name: 'Thin Blood', points: 4 }]) });
    const out: any = await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, amount: 1 });
    assert.equal(out.bloodPool, 4);
  });

  it('reawakens a thin-blood\'s body for a Willpower point and five blood, and no one else\'s', async () => {
    const w = ashenCourt();
    thin(w, 15, { bloodPool: 10, willpowerTemporary: 3, willpowerSpentTurnRef: -1 });
    const out: any = await spendBlood(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, reawaken: true, reason: 'dinner with her mother' });
    assert.equal(out.bloodPool, 5);
    assert.equal(out.willpowerTemporary, 2);
    assert.ok(w.tables.rows('ledger').some((r: any) => /reawakened the body \(dinner with her mother\)/.test(r.summary)));
    await rejects(spendBlood(w.as(ISOLDE_PLAYER), { characterId: DMITRI, reawaken: true }), 403);
    await rejects(spendBlood(w.as(DMITRI_PLAYER), { characterId: DMITRI, reawaken: true }), 422, 'not-thin-blooded');
  });
});
