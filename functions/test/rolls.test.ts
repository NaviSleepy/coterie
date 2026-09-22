import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handler as rollPool } from '../src/fns/rollPool.ts';
import { handler as sealDifficulty } from '../src/fns/sealDifficulty.ts';
import { handler as revealRoll } from '../src/fns/revealRoll.ts';
import { handler as virtueCheck } from '../src/fns/virtueCheck.ts';
import { handler as scene } from '../src/fns/scene.ts';
import {
  ashenCourt,
  CHRONICLE,
  DMITRI,
  DMITRI_PLAYER,
  ISOLDE,
  ISOLDE_PLAYER,
  rejects,
  ST,
  STRANGER,
  TEAM,
} from './fake.ts';

const TABLE = [`read("team:${TEAM}")`];
const BEHIND_SCREEN = [`read("team:${TEAM}/storyteller")`];

describe('rollPool — the player path', () => {
  it('sums the pool off the sheet, applies the wound penalty, and hides the difficulty', async () => {
    const w = ashenCourt();
    // The mockup's own roll: Dexterity 3 + Firearms 2 − Hurt 1 = 4 dice.
    const roll = await rollPool(w.as(ISOLDE_PLAYER, [8, 10, 3, 1]), {
      characterId: ISOLDE,
      traits: ['dexterity', 'firearms'],
    });

    assert.equal(roll.label, 'Dexterity + Firearms');
    assert.equal(roll.basePool, 5);
    assert.equal(roll.woundPenalty, 1);
    assert.equal(roll.pool, 4);
    assert.equal(roll.netSuccesses, 1);
    assert.equal('difficulty' in roll, false, 'the player response carries no difficulty');

    const row = w.tables.row('rolls', roll.rollId)!;
    assert.deepEqual(row.$permissions, TABLE);
    assert.equal(row.characterName, 'Isolde Marchetti');
    assert.equal('difficulty' in row, false, 'the table-readable row carries no difficulty');

    const secret = w.tables.row('rollSecrets', roll.rollId)!;
    assert.equal(secret.difficulty, 6);
    assert.deepEqual(secret.$permissions, BEHIND_SCREEN);
  });

  for (const field of ['difficulty', 'basePool', 'modifier', 'visibility', 'label']) {
    it(`refuses a player who sends ${field}`, async () => {
      const w = ashenCourt();
      const body: any = { characterId: ISOLDE, traits: ['dexterity', 'firearms'] };
      body[field] = field === 'visibility' ? 'storyteller' : field === 'label' ? 'x' : 2;
      await rejects(rollPool(w.as(ISOLDE_PLAYER), body), 403);
      assert.equal(w.tables.rows('rolls').length, 0);
    });
  }

  it("refuses a roll on another player's character", async () => {
    const w = ashenCourt();
    await rejects(rollPool(w.as(DMITRI_PLAYER), { characterId: ISOLDE, traits: ['wits'] }), 403);
  });

  it('refuses a stranger identically whether the character exists or not', async () => {
    const w = ashenCourt();
    const real = await rejects(rollPool(w.as(STRANGER), { characterId: ISOLDE, traits: ['wits'] }), 403);
    const fake = await rejects(rollPool(w.as(STRANGER), { characterId: 'nope', traits: ['wits'] }), 403);
    assert.equal(real.message, fake.message);
  });

  it('refuses an illegal specialty rather than rolling without it', async () => {
    const w = ashenCourt();
    await rejects(
      rollPool(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, traits: ['dexterity', 'firearms'], specialty: 'firearms' }),
      400,
    );
  });

  it('rerolls tens on a legal specialty', async () => {
    const w = ashenCourt();
    const roll = await rollPool(w.as(ISOLDE_PLAYER, [10, 4, 4, 4, 4, 4, 4, 7]), {
      characterId: ISOLDE,
      traits: ['appearance', 'performance'],
      specialty: 'performance',
    });
    assert.equal(roll.dice.length, 8); // 8 − 1 wound = 7 dice, plus one reroll
    assert.equal(roll.dice[7].rerolled, true);
  });
});

describe('rollPool — Willpower', () => {
  it('spends one point and stamps the turn', async () => {
    const w = ashenCourt();
    const roll = await rollPool(w.as(ISOLDE_PLAYER, [3, 3, 3, 3]), {
      characterId: ISOLDE,
      traits: ['dexterity', 'firearms'],
      spendWillpower: true,
    });
    assert.equal(roll.willpowerSpent, true);
    assert.equal(roll.outcome, 'success');
    const c = w.tables.row('characters', ISOLDE)!;
    assert.equal(c.willpowerTemporary, 2);
    assert.equal(c.willpowerSpentTurnRef, 3);
    assert.equal(c.version, 1);
  });

  it('refuses a second spend in the same turn and allows it after the ST advances', async () => {
    const w = ashenCourt();
    const body = { characterId: ISOLDE, traits: ['wits'], spendWillpower: true };
    await rollPool(w.as(ISOLDE_PLAYER), body);
    const refusal = await rejects(rollPool(w.as(ISOLDE_PLAYER), body), 422, 'willpower');
    assert.match(refusal.message, /already spent this turn/);

    await scene(w.as(ST), { action: 'advance', chronicleId: CHRONICLE });
    const roll = await rollPool(w.as(ISOLDE_PLAYER), body);
    assert.equal(roll.willpowerSpent, true);
  });
});

describe('sealed difficulties', () => {
  it('only the Storyteller can seal', async () => {
    const w = ashenCourt();
    await rejects(sealDifficulty(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, difficulty: 2 }), 403);
  });

  it('shows the player a sealed envelope, never the number', async () => {
    const w = ashenCourt();
    await sealDifficulty(w.as(ST), { characterId: ISOLDE, difficulty: 8 });
    const c = w.tables.row('characters', ISOLDE)!;
    assert.equal(c.difficultySealed, true);
    assert.equal('difficulty' in c, false);
    assert.deepEqual(w.tables.row('sealedDifficulties', ISOLDE)!.$permissions, BEHIND_SCREEN);
  });

  it('is consumed by the next roll, which is resolved against it', async () => {
    const w = ashenCourt();
    await sealDifficulty(w.as(ST), { characterId: ISOLDE, difficulty: 8 });
    const roll = await rollPool(w.as(ISOLDE_PLAYER, [7, 7, 7, 7]), {
      characterId: ISOLDE,
      traits: ['dexterity', 'firearms'],
    });
    assert.equal(roll.netSuccesses, 0, 'sevens fail against 8');
    assert.equal(w.tables.row('rollSecrets', roll.rollId)!.difficulty, 8);
    assert.equal(w.tables.row('sealedDifficulties', ISOLDE), undefined);
    assert.equal(w.tables.row('characters', ISOLDE)!.difficultySealed, false);
  });
});

describe('rolls behind the screen', () => {
  it('lets the ST roll with raw pool, difficulty and hidden visibility', async () => {
    const w = ashenCourt();
    const roll = await rollPool(w.as(ST, [9, 2, 2]), {
      characterId: DMITRI,
      basePool: 3,
      difficulty: 8,
      label: 'Perception + Alertness',
      visibility: 'storyteller',
    });
    assert.equal(roll.difficulty, 8);
    assert.equal(roll.difficultySource, 'storyteller');
    assert.deepEqual(w.tables.row('rolls', roll.rollId)!.$permissions, BEHIND_SCREEN);
  });

  it('breaks the seal for roll and difficulty together', async () => {
    const w = ashenCourt();
    const roll = await rollPool(w.as(ST), {
      characterId: DMITRI,
      basePool: 3,
      difficulty: 8,
      visibility: 'storyteller',
    });
    await rejects(revealRoll(w.as(DMITRI_PLAYER), { rollId: roll.rollId }), 403);

    await revealRoll(w.as(ST), { rollId: roll.rollId });
    const row = w.tables.row('rolls', roll.rollId)!;
    assert.equal(row.revealedDifficulty, 8);
    assert.equal(row.visibility, 'table');
    assert.ok(row.$permissions.includes(TABLE[0]));
    assert.ok(w.tables.row('rollSecrets', roll.rollId)!.$permissions.includes(TABLE[0]));
  });

  it('never lets a roll row be updated or deleted by any role', async () => {
    const w = ashenCourt();
    const roll = await rollPool(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, traits: ['wits'] });
    const perms: string[] = w.tables.row('rolls', roll.rollId)!.$permissions;
    assert.equal(perms.some((p) => p.startsWith('update') || p.startsWith('delete')), false);
  });
});

describe('virtueCheck', () => {
  it('drops the Path on a failed degeneration check and logs the sin', async () => {
    const w = ashenCourt();
    const roll = await virtueCheck(w.as(ST, [2, 3, 4]), {
      characterId: ISOLDE,
      kind: 'degeneration',
      sin: 'Fed from a sleeping child of the Rookery',
      difficulty: 7,
    });
    assert.equal(roll.label, 'Degeneration · Conscience');
    assert.equal(roll.outcome, 'failure');
    assert.match(roll.note!, /Humanity falls to 5/);
    assert.equal(w.tables.row('characters', ISOLDE)!.pathRating, 5);
    assert.deepEqual(w.tables.row('rolls', roll.rollId)!.$permissions, TABLE, 'the fall is public');
  });

  it('holds the Path on success', async () => {
    const w = ashenCourt();
    await virtueCheck(w.as(ST, [9, 9, 9]), { characterId: ISOLDE, kind: 'degeneration', sin: 'x', difficulty: 7 });
    assert.equal(w.tables.row('characters', ISOLDE)!.pathRating, 6);
  });

  it('is the Storyteller\'s to call', async () => {
    const w = ashenCourt();
    await rejects(virtueCheck(w.as(ISOLDE_PLAYER), { characterId: ISOLDE, kind: 'degeneration', sin: 'x' }), 403);
  });

  it('lets a player roll their own frenzy check against a sealed difficulty', async () => {
    const w = ashenCourt();
    await sealDifficulty(w.as(ST), { characterId: ISOLDE, difficulty: 7 });
    const roll = await virtueCheck(w.as(ISOLDE_PLAYER, [7, 7, 7]), { characterId: ISOLDE, kind: 'frenzy' });
    assert.equal(roll.label, 'Frenzy · Self-Control');
    assert.equal(roll.pool, 2, 'Self-Control 3 less the Hurt penalty');
    assert.equal('difficulty' in roll, false);
  });
});
