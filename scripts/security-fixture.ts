/**
 * Seeds a known table in a staging project and mints short-lived JWTs for each
 * role, so the .http specs in http/ can attack it.
 *
 * It builds the table by calling the Functions' own handlers with a server
 * key — the same code paths production runs — rather than writing rows
 * directly, so the fixture can't drift from what the app actually creates.
 *
 *   APPWRITE_ENDPOINT=… APPWRITE_PROJECT_ID=6ab741a5001eb649271f APPWRITE_API_KEY=… \
 *     node --experimental-strip-types scripts/security-fixture.ts
 *
 * Writes http/http-client.private.env.json (gitignored). JWTs last 15 minutes.
 * It creates users, so it only runs against the project IDs in STAGING_PROJECTS.
 */

import { writeFileSync } from 'node:fs';

import { Client, Query, TablesDB, Teams, Users } from 'node-appwrite';

import { cryptoDie } from '../engine/src/index.ts';
import { handler as character } from '../functions/src/fns/character.ts';
import { handler as chronicle } from '../functions/src/fns/chronicle.ts';
import { handler as createSecret } from '../functions/src/fns/createSecret.ts';
import { handler as rollPool } from '../functions/src/fns/rollPool.ts';
import { handler as sealDifficulty } from '../functions/src/fns/sealDifficulty.ts';
import type { Ctx } from '../functions/src/shared/http.ts';
import { Store, type TablesLike, type TeamsLike } from '../functions/src/shared/store.ts';

const endpoint = process.env.APPWRITE_ENDPOINT;
const project = process.env.APPWRITE_PROJECT_ID;
const key = process.env.APPWRITE_API_KEY;
if (!endpoint || !project || !key) {
  console.error('APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY are required.');
  process.exit(1);
}
// Appwrite project IDs are generated, so a name check can't tell staging from
// production. Only projects listed here are ever seeded; add a new staging
// project's ID to run against it.
const STAGING_PROJECTS = ['6ab741a5001eb649271f'];
if (!STAGING_PROJECTS.includes(project)) {
  console.error(`Refusing to seed "${project}": not a known staging project (${STAGING_PROJECTS.join(', ')}).`);
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
const users = new Users(client);
const store = new Store(new TablesDB(client) as unknown as TablesLike, new Teams(client) as unknown as TeamsLike);

const ROLES = {
  st: 'sec-storyteller',
  player: 'sec-player',
  other: 'sec-other-player',
  stranger: 'sec-stranger',
} as const;

const as = (userId: string): Ctx => ({ store, userId, die: cryptoDie, now: () => new Date(), log: () => {} });

async function ensureUser(id: string) {
  try {
    await users.get({ userId: id });
  } catch (e) {
    if ((e as { code?: number }).code !== 404) throw e;
    await users.create({ userId: id, email: `${id}@coterie.invalid`, name: id });
  }
}

for (const id of Object.values(ROLES)) await ensureUser(id);

// One chronicle per staging project, found by its Storyteller.
let [chron]: any = await store.list('chronicles', [Query.equal('storytellerId', ROLES.st), Query.limit(1)]);
if (!chron) chron = await chronicle(as(ROLES.st), { action: 'create', name: 'Security Fixture' });
const chronicleId: string = chron.$id;
for (const id of [ROLES.player, ROLES.other]) {
  await chronicle(as(id), { action: 'join', inviteCode: chron.inviteCode });
}

async function ensureCharacter(ownerId: string, name: string): Promise<string> {
  const [existing] = await store.list('characters', [
    Query.equal('chronicleId', chronicleId),
    Query.equal('ownerId', ownerId),
    Query.limit(1),
  ]);
  if (existing) return existing.$id;
  const out: any = await character(as(ownerId), {
    action: 'create',
    chronicleId,
    profile: { name },
    sheet: { generation: 10, attributes: { dexterity: 3 }, abilities: { firearms: 2 } },
  });
  return out.characterId;
}

const playerCharacterId = await ensureCharacter(ROLES.player, 'Test Subject');
const otherCharacterId = await ensureCharacter(ROLES.other, 'Other Player');

const tableRoll: any = await rollPool(as(ROLES.player), { characterId: playerCharacterId, traits: ['dexterity', 'firearms'] });
const hiddenRoll: any = await rollPool(as(ROLES.st), {
  characterId: otherCharacterId,
  basePool: 3,
  difficulty: 8,
  label: 'Perception + Alertness',
  visibility: 'storyteller',
});
await sealDifficulty(as(ROLES.st), { characterId: playerCharacterId, difficulty: 9 });
const { secretId } = await createSecret(as(ROLES.st), {
  chronicleId,
  body: 'Fixture secret: known to the other player only.',
  subjectCharacterId: playerCharacterId,
  visibleTo: [ROLES.other],
});

const jwt = async (userId: string) => (await users.createJWT({ userId, duration: 900 })).jwt;

const env = {
  staging: {
    jwtStoryteller: await jwt(ROLES.st),
    jwtPlayer: await jwt(ROLES.player),
    jwtOther: await jwt(ROLES.other),
    jwtStranger: await jwt(ROLES.stranger),
    chronicleId,
    teamId: chron.teamId,
    playerCharacterId,
    otherCharacterId,
    tableRollId: tableRoll.rollId,
    hiddenRollId: hiddenRoll.rollId,
    secretId,
  },
};
writeFileSync(new URL('../http/http-client.private.env.json', import.meta.url), JSON.stringify(env, null, 2));
console.log(`Fixture ready in ${project}. JWTs expire in 15 minutes.`);
