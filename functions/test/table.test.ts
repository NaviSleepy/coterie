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
