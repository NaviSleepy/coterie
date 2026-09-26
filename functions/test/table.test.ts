import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handler as character } from '../src/fns/character.ts';
import { handler as chronicle, inviteCode } from '../src/fns/chronicle.ts';
import { handler as createSecret } from '../src/fns/createSecret.ts';
import { handler as revealSecret } from '../src/fns/revealSecret.ts';
import { handler as scene } from '../src/fns/scene.ts';
import {
  ashenCourt,
  CHRONICLE,
  DMITRI,
  DMITRI_PLAYER,
  ISOLDE,
  ISOLDE_PLAYER,
  rejects,
  SCENE,
  ST,
  STRANGER,
  TEAM,
  world,
} from './fake.ts';

describe('chronicles and invites', () => {
  it('makes the creator the Storyteller of a new team', async () => {
    const w = world();
    const c: any = await chronicle(w.as('user_new_st'), { action: 'create', name: 'By Night' });
    assert.equal(c.storytellerId, 'user_new_st');
    const team = w.teams.teams.get(c.teamId)!;
    assert.deepEqual(team.members, [{ userId: 'user_new_st', roles: ['owner', 'storyteller'] }]);
    assert.deepEqual(w.tables.row('chronicles', c.$id)!.$permissions, [`read("team:${c.teamId}")`]);
  });

  it('joins a player by code, case- and space-insensitively, exactly once', async () => {
    const w = ashenCourt();
    await chronicle(w.as(STRANGER), { action: 'join', inviteCode: 'ashen 234' });
    await chronicle(w.as(STRANGER), { action: 'join', inviteCode: 'ASHEN234' });
    const joined = w.teams.teams.get(TEAM)!.members.filter((m) => m.userId === STRANGER);
    assert.deepEqual(joined, [{ userId: STRANGER, roles: ['player'] }]);
  });

  it('rejects an unknown code', async () => {
    await rejects(chronicle(ashenCourt().as(STRANGER), { action: 'join', inviteCode: 'NOPE' }), 404);
  });

  it('lets only the ST rotate the code, which kills the old one', async () => {
    const w = ashenCourt();
    await rejects(chronicle(w.as(ISOLDE_PLAYER), { action: 'rotateInvite', chronicleId: CHRONICLE }), 403);
    const { inviteCode: fresh }: any = await chronicle(w.as(ST), { action: 'rotateInvite', chronicleId: CHRONICLE });
    assert.notEqual(fresh, 'ASHEN234');
    await rejects(chronicle(w.as(STRANGER), { action: 'join', inviteCode: 'ASHEN234' }), 404);
  });

  it('mints codes without the characters people misread', () => {
    for (let i = 0; i < 200; i++) assert.match(inviteCode(), /^[A-HJKMNP-Z2-9]{8}$/);
  });
});

describe('characters', () => {
  const sheet = {
    clan: 'Tremere',
    generation: 9,
    attributes: { wits: 4, intelligence: 4 },
    abilities: { occult: 4 },
    specialties: [{ trait: 'occult', text: 'Thaumaturgy' }],
    virtues: { conscience: 3, selfControl: 4, courage: 2 },
    willpowerPermanent: 7,
  };

  it('creates a mechanical row nobody can write and a profile its owner can', async () => {
    const w = ashenCourt();
    const { characterId, bloodPool }: any = await character(w.as(DMITRI_PLAYER, [9]), {
      action: 'create',
      chronicleId: CHRONICLE,
      profile: { name: 'Ceren Aydın' },
      sheet,
    });
    const row = w.tables.row('characters', characterId)!;
    assert.equal(row.bloodPoolMax, 14);
    assert.equal(row.bloodPerTurn, 2);
    assert.equal(bloodPool, 9, 'starting blood is a server die');
    assert.deepEqual(row.$permissions, [`read("user:${DMITRI_PLAYER}")`, `read("team:${TEAM}/storyteller")`]);
    assert.ok(w.tables.row('profiles', characterId)!.$permissions.includes(`update("user:${DMITRI_PLAYER}")`));
  });

  it('refuses a specialty below four dots and out-of-range dots', async () => {
    const w = ashenCourt();
    const base = { action: 'create', chronicleId: CHRONICLE, profile: { name: 'X' } };
    await rejects(character(w.as(DMITRI_PLAYER), { ...base, sheet: { ...sheet, abilities: { occult: 3 } } }), 400);
    await rejects(character(w.as(DMITRI_PLAYER), { ...base, sheet: { ...sheet, attributes: { wits: 6 } } }), 400);
    await rejects(character(w.as(DMITRI_PLAYER), { ...base, sheet: { ...sheet, generation: 3 } }), 400);
  });

  it('stores merits and flaws, and refuses points outside 1–7 or a blank name', async () => {
    const w = ashenCourt();
    const base = { action: 'create', chronicleId: CHRONICLE, profile: { name: 'X' } };
    const { characterId }: any = await character(w.as(DMITRI_PLAYER), {
      ...base,
      sheet: { ...sheet, merits: [{ name: ' Eidetic Memory ', points: 2 }], flaws: [{ name: 'Nightmares', points: 1 }] },
    });
    const row = w.tables.row('characters', characterId)!;
    assert.deepEqual(JSON.parse(row.merits), [{ name: 'Eidetic Memory', points: 2 }]);
    assert.deepEqual(JSON.parse(row.flaws), [{ name: 'Nightmares', points: 1 }]);

    for (const points of [0, -3, 8]) {
      await rejects(character(w.as(DMITRI_PLAYER), { ...base, sheet: { ...sheet, merits: [{ name: 'M', points }] } }), 400);
      await rejects(character(w.as(DMITRI_PLAYER), { ...base, sheet: { ...sheet, flaws: [{ name: 'F', points }] } }), 400);
    }
    await rejects(character(w.as(DMITRI_PLAYER), { ...base, sheet: { ...sheet, flaws: [{ name: '  ', points: 2 }] } }), 400);
  });

  it('refuses someone not at the table', async () => {
    const w = ashenCourt();
    await rejects(
      character(w.as(STRANGER), { action: 'create', chronicleId: CHRONICLE, profile: { name: 'X' }, sheet }),
      403,
    );
  });

  it('lets only the ST adjust, and clamps the pool when generation moves', async () => {
    const w = ashenCourt();
    await rejects(character(w.as(ISOLDE_PLAYER), { action: 'adjust', characterId: ISOLDE, sheet: { bloodPool: 13 } }), 403);
    await character(w.as(ST), { action: 'adjust', characterId: ISOLDE, sheet: { generation: 13 } });
    const row = w.tables.row('characters', ISOLDE)!;
    assert.equal(row.bloodPoolMax, 10);
    assert.equal(row.bloodPool, 8);
    assert.equal(row.version, 1);
  });
});

describe('proposals', () => {
  const propose = (w: any, who: string, sheet: any) =>
    character(w.as(who), { action: 'propose', characterId: ISOLDE, sheet });

  it("holds a player's edits apart from the sheet, readable by them and the ST only", async () => {
    const w = ashenCourt();
    const out: any = await propose(w, ISOLDE_PLAYER, {
      abilities: { firearms: 3, performance: 4, subterfuge: 4 },
      merits: [{ name: 'Eat Food', points: 1 }],
    });
    assert.equal(out.revision, 1);
    assert.deepEqual(out.changes.sort(), ['abilities', 'merits']);

    const p = w.tables.row('proposals', ISOLDE)!;
    assert.equal(JSON.parse(p.sheet).merits[0].name, 'Eat Food');
    assert.deepEqual(p.$permissions, [`read("user:${ISOLDE_PLAYER}")`, `read("team:${TEAM}/storyteller")`]);
    assert.equal(JSON.parse(w.tables.row('characters', ISOLDE)!.abilities).firearms, 2, 'the sheet has not moved');
    assert.equal(w.tables.row('characters', ISOLDE)!.version, 0);
  });

  it('keeps only real changes, bumps the revision on each edit, and clears when nothing differs', async () => {
    const w = ashenCourt();
    await propose(w, ISOLDE_PLAYER, { pathRating: 7 });
    const second: any = await propose(w, ISOLDE_PLAYER, { pathRating: 7, clan: 'Toreador', willpowerPermanent: 6 });
    assert.equal(second.revision, 2);
    assert.deepEqual(Object.keys(JSON.parse(w.tables.row('proposals', ISOLDE)!.sheet)).sort(), ['pathRating', 'willpowerPermanent']);

    const cleared: any = await propose(w, ISOLDE_PLAYER, { pathRating: 6 });
    assert.equal(cleared.revision, 0);
    assert.equal(w.tables.row('proposals', ISOLDE), undefined);
  });

  it('refuses state, other players, and a specialty below four dots', async () => {
    const w = ashenCourt();
    for (const sheet of [{ bloodPool: 13 }, { experienceTotal: 50 }, { willpowerTemporary: 5 }, { healthLethal: 0 }]) {
      await rejects(propose(w, ISOLDE_PLAYER, sheet), 403);
    }
    await rejects(propose(w, DMITRI_PLAYER, { pathRating: 7 }), 403);
    await rejects(propose(w, ST, { pathRating: 7 }), 403);
    await rejects(propose(w, ISOLDE_PLAYER, { specialties: [{ trait: 'firearms', text: 'Pistols' }] }), 400);
  });

  it('lets only the ST approve, applies it through the ledger, and removes the proposal with it', async () => {
    const w = ashenCourt();
    await propose(w, ISOLDE_PLAYER, { merits: [{ name: 'Eat Food', points: 1 }], flaws: [{ name: 'Nightmares', points: 1 }] });
    await rejects(character(w.as(ISOLDE_PLAYER), { action: 'approve', characterId: ISOLDE, revision: 1 }), 403);

    const out: any = await character(w.as(ST), { action: 'approve', characterId: ISOLDE, revision: 1 });
    assert.equal(out.version, 1);
    const row = w.tables.row('characters', ISOLDE)!;
    assert.deepEqual(JSON.parse(row.merits), [{ name: 'Eat Food', points: 1 }]);
    assert.deepEqual(JSON.parse(row.flaws), [{ name: 'Nightmares', points: 1 }]);
    assert.equal(w.tables.row('proposals', ISOLDE), undefined);
    assert.equal(w.tables.row('ledger', `${ISOLDE}.v1`)!.fn, 'approve');
  });

  it('refuses to approve a draft that changed after the ST read it', async () => {
    const w = ashenCourt();
    await propose(w, ISOLDE_PLAYER, { pathRating: 7 });
    await propose(w, ISOLDE_PLAYER, { pathRating: 10 });
    await rejects(character(w.as(ST), { action: 'approve', characterId: ISOLDE, revision: 1 }), 409, 'stale-proposal');
    assert.equal(w.tables.row('characters', ISOLDE)!.pathRating, 6);
  });

  it('follows generation into the blood limits when approved', async () => {
    const w = ashenCourt();
    await propose(w, ISOLDE_PLAYER, { generation: 13 });
    await character(w.as(ST), { action: 'approve', characterId: ISOLDE, revision: 1 });
    const row = w.tables.row('characters', ISOLDE)!;
    assert.equal(row.bloodPoolMax, 10);
    assert.equal(row.bloodPool, 8);
  });

  it('lets the ST decline with a note, and the player withdraw', async () => {
    const w = ashenCourt();
    await propose(w, ISOLDE_PLAYER, { pathRating: 9 });
    await rejects(character(w.as(ISOLDE_PLAYER), { action: 'reject', characterId: ISOLDE }), 403);
    await character(w.as(ST), { action: 'reject', characterId: ISOLDE, note: 'Earn it in play.' });
    const p = w.tables.row('proposals', ISOLDE)!;
    assert.equal(p.status, 'declined');
    assert.equal(p.note, 'Earn it in play.');

    const again: any = await propose(w, ISOLDE_PLAYER, { pathRating: 7 });
    assert.equal(w.tables.row('proposals', ISOLDE)!.status, 'pending', 'editing reopens it');
    assert.equal(again.revision, 2);

    await rejects(character(w.as(DMITRI_PLAYER), { action: 'withdraw', characterId: ISOLDE }), 403);
    await character(w.as(ISOLDE_PLAYER), { action: 'withdraw', characterId: ISOLDE });
    assert.equal(w.tables.row('proposals', ISOLDE), undefined);
    await character(w.as(ISOLDE_PLAYER), { action: 'withdraw', characterId: ISOLDE });
  });

  it("lets the ST adjust merits and flaws directly", async () => {
    const w = ashenCourt();
    await character(w.as(ST), { action: 'adjust', characterId: DMITRI, sheet: { flaws: [{ name: 'Prey Exclusion', points: 1 }] } });
    assert.deepEqual(JSON.parse(w.tables.row('characters', DMITRI)!.flaws), [{ name: 'Prey Exclusion', points: 1 }]);
  });
});

describe('secrets', () => {
  it('seals a secret about a character for that character\'s player', async () => {
    const w = ashenCourt();
    const { secretId } = await createSecret(w.as(ST), {
      chronicleId: CHRONICLE,
      body: 'Someone in Elysium has been feeding on Isolde\'s herd.',
      subjectCharacterId: ISOLDE,
      visibleTo: [DMITRI_PLAYER],
    });

    const secret = w.tables.row('secrets', secretId)!;
    assert.deepEqual(secret.$permissions, [`read("team:${TEAM}/storyteller")`, `read("user:${DMITRI_PLAYER}")`]);

    const seal = w.tables.row('seals', secretId)!;
    assert.equal(seal.knownCount, 1);
    assert.equal('body' in seal, false, 'the seal carries no text');
    assert.ok(seal.$permissions.includes(`read("user:${ISOLDE_PLAYER}")`));
  });

  it('reveals to exactly one more reader and updates the seal', async () => {
    const w = ashenCourt();
    const { secretId } = await createSecret(w.as(ST), { chronicleId: CHRONICLE, body: 'x', subjectCharacterId: ISOLDE });
    await revealSecret(w.as(ST), { secretId, userId: DMITRI_PLAYER });
    assert.ok(w.tables.row('secrets', secretId)!.$permissions.includes(`read("user:${DMITRI_PLAYER}")`));
    assert.equal(w.tables.row('seals', secretId)!.knownCount, 1);
  });

  it('is the Storyteller\'s alone, and only for people at the table', async () => {
    const w = ashenCourt();
    await rejects(createSecret(w.as(ISOLDE_PLAYER), { chronicleId: CHRONICLE, body: 'x' }), 403);
    const { secretId } = await createSecret(w.as(ST), { chronicleId: CHRONICLE, body: 'x' });
    await rejects(revealSecret(w.as(ISOLDE_PLAYER), { secretId, userId: ISOLDE_PLAYER }), 403);
    await rejects(revealSecret(w.as(ST), { secretId, userId: STRANGER }), 400);
  });
});

describe('scenes', () => {
  it('advances the chronicle-wide turn serial', async () => {
    const w = ashenCourt();
    const { turn }: any = await scene(w.as(ST), { action: 'advance', chronicleId: CHRONICLE });
    assert.equal(turn, 4);
    assert.equal(w.tables.row('chronicles', CHRONICLE)!.turnSerial, 4);
  });

  it('rolls initiative on the server and keeps NPC entries', async () => {
    const w = ashenCourt();
    const { initiative }: any = await scene(w.as(ST, [5, 6]), {
      action: 'rollInitiative',
      chronicleId: CHRONICLE,
      entries: [{ label: 'Sheriff Aldana', value: 7 }],
    });
    assert.deepEqual(
      initiative.map((e: any) => `${e.value} ${e.label}`),
      ['11 Isolde', '11 Dmitri', '7 Sheriff Aldana'].sort((a, b) => parseInt(b) - parseInt(a) || a.localeCompare(b)),
    );
    assert.equal(w.tables.row('scenes', SCENE)!.initiative.includes('Sheriff'), true);
  });

  it('is the Storyteller\'s alone', async () => {
    await rejects(scene(ashenCourt().as(ISOLDE_PLAYER), { action: 'advance', chronicleId: CHRONICLE }), 403);
  });
});
