import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handler as character } from '../src/fns/character.ts';
import { handler as chronicle, inviteCode } from '../src/fns/chronicle.ts';
import { handler as createSecret } from '../src/fns/createSecret.ts';
import { handler as revealSecret } from '../src/fns/revealSecret.ts';
import { handler as rollPool } from '../src/fns/rollPool.ts';
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

  it('starts a new chronicle with the starter chronicle\'s library, readable by its own team', async () => {
    const w = ashenCourt();
    const st = { ...w.as(ST), starterChronicleId: CHRONICLE };
    await chronicle(st, { action: 'saveEntry', chronicleId: CHRONICLE, kind: 'sect', name: 'Camarilla', summary: 'Ivory Tower', page: 'V20 p. 38' });
    await chronicle(st, { action: 'saveEntry', chronicleId: CHRONICLE, kind: 'merit', name: 'Iron Will', points: 3 });
    const source = w.tables.rows('library').filter((r: any) => r.chronicleId === CHRONICLE).length;
    const c: any = await chronicle({ ...w.as('user_new_st'), starterChronicleId: CHRONICLE }, { action: 'create', name: 'By Night' });
    assert.equal(c.libraryCopied, source);
    const copied = w.tables.rows('library').filter((r: any) => r.chronicleId === c.$id);
    assert.equal(copied.length, source);
    const sect = copied.find((r: any) => r.kind === 'sect')!;
    assert.equal(sect.summary, 'Ivory Tower');
    assert.deepEqual(sect.$permissions, [`read("team:${c.teamId}")`]);
    assert.equal(copied.find((r: any) => r.kind === 'merit')!.points, 3);
    assert.equal(w.tables.rows('library').filter((r: any) => r.chronicleId === CHRONICLE).length, source, 'the source is untouched');
  });

  it('creates a chronicle with an empty library when no starter is configured', async () => {
    const w = world();
    const c: any = await chronicle(w.as('user_new_st'), { action: 'create', name: 'By Night' });
    assert.equal(c.libraryCopied, 0);
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

describe('NPCs', () => {
  const save = (w: any, who: string, npc: any, npcId?: string) =>
    chronicle(w.as(who), { action: 'saveNpc', chronicleId: CHRONICLE, npc, ...(npcId ? { npcId } : {}) });

  it('keeps NPCs behind the screen: the Storyteller alone creates, edits, reads and removes them', async () => {
    const w = ashenCourt();
    const { npcId }: any = await save(w, ST, { name: 'Sheriff Aldana', clan: 'Brujah', generation: 9, attributes: { strength: 4, dexterity: 3 }, abilities: { brawl: 4 }, willpowerMax: 6 });
    const row = w.tables.row('npcs', npcId)!;
    assert.deepEqual(row.$permissions, [`read("team:${TEAM}/storyteller")`]);
    assert.equal(JSON.parse(row.attributes).strength, 4);
    assert.equal(JSON.parse(row.attributes).wits, 2, 'unspecified Attributes default to 2');
    assert.equal(row.willpower, 6);

    await rejects(save(w, ISOLDE_PLAYER, { name: 'Free Ghoul' }), 403);
    await rejects(save(w, ISOLDE_PLAYER, { healthLethal: 7 }, npcId), 403);
    await rejects(chronicle(w.as(ISOLDE_PLAYER), { action: 'removeNpc', chronicleId: CHRONICLE, npcId }), 403);

    await save(w, ST, { healthLethal: 2, notes: 'Owes Dmitri.' }, npcId);
    assert.equal(w.tables.row('npcs', npcId)!.healthLethal, 2);
    assert.equal(JSON.parse(w.tables.row('npcs', npcId)!.attributes).strength, 4, 'an edit leaves other fields alone');
    await rejects(save(w, ST, { healthBashing: 6 }, npcId), 400);
    await rejects(save(w, ST, { willpower: 9 }, npcId), 400);
    await rejects(save(w, ST, { name: '' }), 400);

    await chronicle(w.as(ST), { action: 'removeNpc', chronicleId: CHRONICLE, npcId });
    assert.equal(w.tables.row('npcs', npcId), undefined);
  });

  it('rolls an NPC from its stat block, hidden by default, with its wounds and Willpower', async () => {
    const w = ashenCourt();
    const { npcId }: any = await save(w, ST, { name: 'Sheriff Aldana', attributes: { strength: 4 }, abilities: { brawl: 3 }, healthBashing: 2, willpowerMax: 2 });
    const roll: any = await rollPool(w.as(ST, [8, 8, 8, 2, 2, 2, 2]), { npcId, traits: ['strength', 'brawl'], difficulty: 6, spendWillpower: true });
    assert.equal(roll.basePool, 7);
    assert.equal(roll.woundPenalty, 1, 'Hurt: −1');
    assert.equal(roll.pool, 6);
    assert.equal(roll.visibility, 'storyteller');
    const row = w.tables.row('rolls', roll.rollId)!;
    assert.equal(row.characterName, 'Sheriff Aldana');
    assert.equal(row.characterId, null);
    assert.deepEqual(row.$permissions, [`read("team:${TEAM}/storyteller")`]);
    assert.equal(w.tables.row('npcs', npcId)!.willpower, 1);

    const shown: any = await rollPool(w.as(ST, [9]), { npcId, basePool: 2, visibility: 'table' });
    assert.deepEqual(w.tables.row('rolls', shown.rollId)!.$permissions, [`read("team:${TEAM}")`]);
    await rejects(rollPool(w.as(ISOLDE_PLAYER), { npcId, traits: ['strength'] }), 403);
  });

  it('rolls NPCs into initiative alongside the coterie', async () => {
    const w = ashenCourt();
    const { npcId }: any = await save(w, ST, { name: 'Sheriff Aldana', attributes: { dexterity: 4, wits: 3 } });
    await scene(w.as(ST, [5]), { action: 'rollInitiative', chronicleId: CHRONICLE, npcIds: [npcId, 'nope'] });
    const order = JSON.parse(w.tables.row('scenes', SCENE)!.initiative);
    assert.ok(order.some((e: any) => e.label === 'Sheriff Aldana' && e.value === 12 && !e.characterId));
  });
});

describe('rituals on the sheet', () => {
  it('lets a player propose rituals and the Storyteller approve or set them', async () => {
    const w = ashenCourt();
    const { revision }: any = await character(w.as(ISOLDE_PLAYER), { action: 'propose', characterId: ISOLDE, sheet: { rituals: [{ name: 'Blood Rush', level: 1 }, { name: 'Sun Dance', level: 0 }] } });
    await character(w.as(ST), { action: 'approve', characterId: ISOLDE, revision });
    assert.deepEqual(JSON.parse(w.tables.row('characters', ISOLDE)!.rituals), [{ name: 'Blood Rush', level: 1 }, { name: 'Sun Dance', level: 0 }]);
    await character(w.as(ST), { action: 'adjust', characterId: ISOLDE, sheet: { rituals: [{ name: 'Ward versus Kindred', level: 4 }] } });
    assert.equal(JSON.parse(w.tables.row('characters', ISOLDE)!.rituals)[0].name, 'Ward versus Kindred');
    await rejects(character(w.as(ST), { action: 'adjust', characterId: ISOLDE, sheet: { rituals: [{ name: '' }] } }), 400);
    await rejects(character(w.as(ST), { action: 'adjust', characterId: ISOLDE, sheet: { rituals: [{ name: 'X', level: 11 }] } }), 400);
  });
});

describe('sect titles', () => {
  it('lets only the Storyteller award a title, never a player at creation or by proposal', async () => {
    const w = ashenCourt();
    await character(w.as(ST), { action: 'adjust', characterId: ISOLDE, sheet: { title: 'Keeper of Elysium' } });
    assert.equal(w.tables.row('characters', ISOLDE)!.title, 'Keeper of Elysium');
    await rejects(character(w.as(ISOLDE_PLAYER), { action: 'propose', characterId: ISOLDE, sheet: { title: 'Prince' } }), 403);
    const { characterId }: any = await character(w.as(DMITRI_PLAYER, [3]), { action: 'create', chronicleId: CHRONICLE, profile: { name: 'Upstart' }, sheet: { title: 'Prince' } });
    assert.ok(!w.tables.row('characters', characterId)!.title, 'creation ignores a self-awarded title');
    await character(w.as(ST), { action: 'adjust', characterId: ISOLDE, sheet: { title: '' } });
    assert.equal(w.tables.row('characters', ISOLDE)!.title, '');
  });

  it('gives NPCs a sect and a title', async () => {
    const w = ashenCourt();
    const { npcId }: any = await chronicle(w.as(ST), { action: 'saveNpc', chronicleId: CHRONICLE, npc: { name: 'Aldana', sect: 'Camarilla', title: 'Sheriff' } });
    assert.equal(w.tables.row('npcs', npcId)!.title, 'Sheriff');
    await chronicle(w.as(ST), { action: 'saveNpc', chronicleId: CHRONICLE, npcId, npc: { title: 'Scourge' } });
    assert.equal(w.tables.row('npcs', npcId)!.title, 'Scourge');
    assert.equal(w.tables.row('npcs', npcId)!.sect, 'Camarilla');
  });
});

describe('the creation budget', () => {
  // Five Abilities at 5 and Celerity 5: far past 15 freebies.
  const greedy = { abilities: { brawl: 5, firearms: 5, melee: 5, athletics: 5, stealth: 5 }, disciplines: [{ name: 'Celerity', level: 5 }] };
  const send = (w: any, user: string, action: string, sheet: any = greedy) =>
    character(w.as(user, [4]), { action, chronicleId: CHRONICLE, profile: { name: 'Overreach' }, sheet });

  it('refuses a player a character over budget, but takes one within it', async () => {
    const w = ashenCourt();
    await rejects(send(w, DMITRI_PLAYER, 'create'), 409);
    const { characterId }: any = await send(w, DMITRI_PLAYER, 'create', { abilities: { brawl: 3 }, disciplines: [{ name: 'Potence', level: 2 }] });
    assert.ok(w.tables.row('characters', characterId));
  });

  it("refuses Generation deeper than five dots can buy, even with freebies to spare", async () => {
    const w = ashenCourt();
    await rejects(send(w, DMITRI_PLAYER, 'create', { generation: 7 }), 409);
  });

  it('lets the Storyteller make an over-budget DMPC', async () => {
    const w = ashenCourt();
    const { characterId }: any = await send(w, ST, 'create');
    assert.equal(w.tables.row('characters', characterId)!.ownerId, ST);
  });

  it('sends an over-budget character to the Storyteller, who approves it into the player\'s hands', async () => {
    const w = ashenCourt();
    const { requestId }: any = await send(w, DMITRI_PLAYER, 'requestCreation');
    const req = w.tables.row('creationRequests', requestId)!;
    assert.equal(req.status, 'pending');
    assert.ok(JSON.parse(req.cost).some((l: string) => /over/.test(l)));
    assert.deepEqual(req.$permissions, [`read("user:${DMITRI_PLAYER}")`, `read("team:${TEAM}/storyteller")`]);

    await rejects(character(w.as(DMITRI_PLAYER), { action: 'approveCreation', requestId }), 403);
    await rejects(character(w.as(ISOLDE_PLAYER), { action: 'withdrawCreation', requestId }), 403);

    const { characterId, ownerId }: any = await character(w.as(ST, [4]), { action: 'approveCreation', requestId });
    assert.equal(ownerId, DMITRI_PLAYER);
    const row = w.tables.row('characters', characterId)!;
    assert.equal(row.ownerId, DMITRI_PLAYER);
    assert.equal(JSON.parse(row.abilities).brawl, 5);
    assert.equal(w.tables.row('profiles', characterId)!.name, 'Overreach');
    assert.equal(w.tables.row('creationRequests', requestId), undefined, 'the request is gone');
  });

  it('declines with a note, refuses to approve a declined request, and lets the player withdraw', async () => {
    const w = ashenCourt();
    const { requestId }: any = await send(w, DMITRI_PLAYER, 'requestCreation');
    await character(w.as(ST), { action: 'declineCreation', requestId, note: 'Trim the Celerity.' });
    assert.equal(w.tables.row('creationRequests', requestId)!.note, 'Trim the Celerity.');
    await rejects(character(w.as(ST), { action: 'approveCreation', requestId }), 409);
    await character(w.as(DMITRI_PLAYER), { action: 'withdrawCreation', requestId });
    assert.equal(w.tables.row('creationRequests', requestId), undefined);
  });

  it('caps a player at three open requests', async () => {
    const w = ashenCourt();
    for (let i = 0; i < 3; i++) await send(w, DMITRI_PLAYER, 'requestCreation');
    await rejects(send(w, DMITRI_PLAYER, 'requestCreation'), 409);
  });
});

describe('dhampirs', () => {
  const create = (w: any, sheet: any, dice = [3]) =>
    character(w.as(DMITRI_PLAYER, dice), { action: 'create', chronicleId: CHRONICLE, profile: { name: 'Mara Kell' }, sheet });

  it('gives a dhampir a full pool of 10 and one blood a turn, whatever the Generation', async () => {
    const w = ashenCourt();
    const { characterId, bloodPool }: any = await create(w, { template: 'dhampir', dhampirConcept: 'Renegade', clan: 'Brujah', generation: 8, disciplines: [{ name: 'Potence', level: 1 }] });
    const row = w.tables.row('characters', characterId)!;
    assert.equal(row.template, 'dhampir');
    assert.equal(row.dhampirConcept, 'Renegade');
    assert.equal(row.bloodPoolMax, 10);
    assert.equal(row.bloodPerTurn, 1);
    assert.equal(bloodPool, 10, 'no die roll: they start full');
  });

  it('keeps a dhampir pool off the Generation table, lets the Storyteller raise it, and resets it on a template change', async () => {
    const w = ashenCourt();
    const { characterId }: any = await create(w, { template: 'dhampir' });
    await character(w.as(ST), { action: 'adjust', characterId, sheet: { generation: 6 } });
    assert.equal(w.tables.row('characters', characterId)!.bloodPoolMax, 10);
    await character(w.as(ST), { action: 'adjust', characterId, sheet: { bloodPoolMax: 12 } });
    assert.equal(w.tables.row('characters', characterId)!.bloodPoolMax, 12, 'Antiquity');
    await character(w.as(ST), { action: 'adjust', characterId, sheet: { template: 'vampire' } });
    assert.equal(w.tables.row('characters', characterId)!.bloodPoolMax, 30, 'a 6th Generation vampire now');
    await rejects(character(w.as(ST), { action: 'adjust', characterId, sheet: { template: 'ghoul' } }), 400);
  });

  it("lets a player propose their dhampir concept, but never their template or pool", async () => {
    const w = ashenCourt();
    const { characterId }: any = await create(w, { template: 'dhampir' });
    await character(w.as(DMITRI_PLAYER), { action: 'propose', characterId, sheet: { dhampirConcept: 'Savant' } });
    await rejects(character(w.as(DMITRI_PLAYER), { action: 'propose', characterId, sheet: { template: 'vampire' } }), 403);
    await rejects(character(w.as(DMITRI_PLAYER), { action: 'propose', characterId, sheet: { bloodPoolMax: 15 } }), 403);
  });

  it('reads characters from before templates as vampires, and allows dhampir NPCs', async () => {
    const w = ashenCourt();
    assert.equal(w.tables.row('characters', ISOLDE)!.template, undefined);
    await character(w.as(ST), { action: 'adjust', characterId: ISOLDE, sheet: { generation: 9 } });
    assert.equal(w.tables.row('characters', ISOLDE)!.bloodPoolMax, 14);
    const { npcId }: any = await chronicle(w.as(ST), { action: 'saveNpc', chronicleId: CHRONICLE, npc: { name: 'Teodor', kind: 'dhampir' } });
    assert.equal(w.tables.row('npcs', npcId)!.kind, 'dhampir');
  });
});

describe('DMPCs', () => {
  it('lets the Storyteller create a character they own, and roll it from its traits', async () => {
    const w = ashenCourt();
    const { characterId }: any = await character(w.as(ST), {
      action: 'create',
      chronicleId: CHRONICLE,
      profile: { name: 'Brother Anselm' },
      sheet: { clan: 'Lasombra', attributes: { dexterity: 3 }, abilities: { melee: 2 } },
    });
    const row = w.tables.row('characters', characterId)!;
    assert.equal(row.ownerId, ST);
    assert.deepEqual(row.$permissions, [`read("user:${ST}")`, `read("team:${TEAM}/storyteller")`]);
    const roll: any = await rollPool(w.as(ST, [8, 8, 8, 8, 8]), { characterId, traits: ['dexterity', 'melee'], difficulty: 6 });
    assert.equal(roll.pool, 5);
  });
});

describe('deleting a character', () => {
  const del = (w: any, who: string, characterId: string, name: string) =>
    character(w.as(who), { action: 'delete', characterId, name });

  it('lets the owner delete their own, clearing everything that points at it', async () => {
    const w = ashenCourt();
    const { secretId } = await createSecret(w.as(ST), { chronicleId: CHRONICLE, body: 'x', subjectCharacterId: ISOLDE, visibleTo: [DMITRI_PLAYER] });
    await character(w.as(ISOLDE_PLAYER), { action: 'propose', characterId: ISOLDE, sheet: { sire: 'Lucrezia' } });
    assert.ok(w.tables.row('proposals', ISOLDE));
    w.tables.seed('sealedDifficulties', ISOLDE, { chronicleId: CHRONICLE, difficulty: 8 });
    w.tables.seed('scenes', SCENE, { ...w.tables.row('scenes', SCENE), initiative: JSON.stringify([{ label: 'Isolde', characterId: ISOLDE, value: 9 }, { label: 'Ghoul', value: 4 }]) });
    const version = w.tables.row('characters', ISOLDE)!.version;

    await del(w, ISOLDE_PLAYER, ISOLDE, '  isolde marchetti ');

    for (const t of ['characters', 'profiles', 'proposals', 'sealedDifficulties'] as const) assert.equal(w.tables.row(t, ISOLDE), undefined, t);
    assert.equal(w.tables.row('seals', secretId), undefined, 'the seal about her goes');
    assert.ok(w.tables.row('secrets', secretId), "the Storyteller's secret stays");
    const scene = w.tables.row('scenes', SCENE)!;
    assert.deepEqual(scene.participants, [DMITRI]);
    assert.deepEqual(JSON.parse(scene.initiative), [{ label: 'Ghoul', value: 4 }]);
    const last = w.tables.row('ledger', `${ISOLDE}.v${version + 1}`)!;
    assert.equal(last.fn, 'delete');
    assert.equal(last.actorId, ISOLDE_PLAYER);
    assert.equal(last.summary, 'deleted Isolde Marchetti');

    // And she can bring someone new.
    const { characterId }: any = await character(w.as(ISOLDE_PLAYER), { action: 'create', chronicleId: CHRONICLE, profile: { name: 'Ottilie' }, sheet: {} });
    assert.equal(w.tables.row('characters', characterId)!.ownerId, ISOLDE_PLAYER);
  });

  it("lets the Storyteller delete anyone's, and no other player", async () => {
    const w = ashenCourt();
    await rejects(del(w, DMITRI_PLAYER, ISOLDE, 'Isolde Marchetti'), 403);
    await rejects(del(w, STRANGER, ISOLDE, 'Isolde Marchetti'), 403);
    assert.ok(w.tables.row('characters', ISOLDE));
    await del(w, ST, ISOLDE, 'Isolde Marchetti');
    assert.equal(w.tables.row('characters', ISOLDE), undefined);
  });

  it('needs the name, so a stray call deletes nothing', async () => {
    const w = ashenCourt();
    await rejects(del(w, ISOLDE_PLAYER, ISOLDE, 'Isolde'), 400);
    await rejects(character(w.as(ISOLDE_PLAYER), { action: 'delete', characterId: ISOLDE }), 400);
    assert.ok(w.tables.row('characters', ISOLDE));
  });

  it('refuses, and deletes nothing, when a write lands on the sheet at the same moment', async () => {
    const w = ashenCourt();
    const version = w.tables.row('characters', ISOLDE)!.version;
    w.tables.beforeCommit = () => { w.tables.seed('ledger', `${ISOLDE}.v${version + 1}`, { characterId: ISOLDE }); };
    await rejects(del(w, ISOLDE_PLAYER, ISOLDE, 'Isolde Marchetti'), 409, 'contended');
    assert.ok(w.tables.row('characters', ISOLDE));
    assert.ok(w.tables.row('profiles', ISOLDE));
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

describe('library', () => {
  const save = (w: any, who: string, entry: any) => chronicle(w.as(who), { action: 'saveEntry', chronicleId: CHRONICLE, ...entry });

  it("lets the ST write entries the whole table can read, and nobody else write them", async () => {
    const w = ashenCourt();
    const { entryId }: any = await save(w, ST, {
      kind: 'merit', name: 'Eat Food', points: 1, summary: 'Can eat and taste; must purge it before dawn.', page: 'V20 p. 481',
    });
    const row = w.tables.row('library', entryId)!;
    assert.equal(row.points, 1);
    assert.equal(row.page, 'V20 p. 481');
    assert.deepEqual(row.$permissions, [`read("team:${TEAM}")`]);

    await rejects(save(w, ISOLDE_PLAYER, { kind: 'merit', name: 'Mine', points: 1 }), 403);
    await rejects(save(w, STRANGER, { kind: 'merit', name: 'Mine', points: 1 }), 403);
    await rejects(chronicle(w.as(ISOLDE_PLAYER), { action: 'removeEntry', chronicleId: CHRONICLE, entryId }), 403);
  });

  it('costs merits and flaws 1–7, and gives other kinds no cost', async () => {
    const w = ashenCourt();
    await rejects(save(w, ST, { kind: 'flaw', name: 'Nightmares' }), 400);
    await rejects(save(w, ST, { kind: 'flaw', name: 'Nightmares', points: 8 }), 400);
    await rejects(save(w, ST, { kind: 'mystery', name: 'X' }), 400);
    const { entryId }: any = await save(w, ST, { kind: 'discipline', name: 'Auspex', points: 3 });
    assert.equal(w.tables.row('library', entryId)!.points, null);
    for (const kind of ['clan', 'power', 'path', 'trait', 'archetype', 'equipment', 'concept', 'ritual', 'title', 'sect']) {
      const { entryId: id }: any = await save(w, ST, { kind, name: `A ${kind}`, points: 2, page: 'V20 p. 1' });
      assert.equal(w.tables.row('library', id)!.kind, kind);
      assert.equal(w.tables.row('library', id)!.points, null);
    }
  });

  it('keeps names unique within a kind, edits in place, and removes', async () => {
    const w = ashenCourt();
    const { entryId }: any = await save(w, ST, { kind: 'flaw', name: 'Nightmares', points: 1 });
    await rejects(save(w, ST, { kind: 'flaw', name: 'nightmares', points: 2 }), 409, 'duplicate');
    await save(w, ST, { kind: 'merit', name: 'Nightmares', points: 1 });

    await save(w, ST, { entryId, kind: 'flaw', name: 'Nightmares', points: 2, summary: 'Our table: roll Willpower on waking.' });
    assert.equal(w.tables.row('library', entryId)!.points, 2);
    await rejects(save(w, ST, { entryId: 'nope', kind: 'flaw', name: 'Other', points: 1 }), 404);

    await chronicle(w.as(ST), { action: 'removeEntry', chronicleId: CHRONICLE, entryId });
    assert.equal(w.tables.row('library', entryId), undefined);
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
