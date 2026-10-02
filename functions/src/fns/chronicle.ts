/**
 * Coterie — chronicle
 *
 * One Appwrite team per chronicle, with two roles: storyteller and player.
 * Every row in the chronicle is permissioned against that team, so membership
 * is the whole of access control; this Function is the only thing that grants
 * it.
 *
 *   create        New chronicle + team; the caller becomes its Storyteller.
 *   join          Redeem an invite code for a player membership.
 *   rotateInvite  ST only. The old code stops working immediately.
 *   update        ST only. Name, botch rule, tenets.
 *   saveEntry     ST only. Adds or edits a library entry: a clan, merit, flaw,
 *                 Discipline or power, Background or house rule in the ST's words,
 *                 readable by the whole table.
 *   removeEntry   ST only.
 *   saveNpc       ST only. Creates an NPC, or edits one (only the fields sent):
 *                 stat block, health, blood, Willpower, notes. Behind the screen.
 *   removeNpc     ST only.
 *
 * Joining goes through a server key because a client can't add itself to a
 * team — which is exactly the property that makes the team a trustworthy
 * permission boundary.
 */

import { ID, Query } from 'node-appwrite';

import { decodeChronicle, loadChronicle, requireStoryteller } from '../shared/auth.ts';
import { badRequest, entry, HttpError, int, notFound, oneOf, optStr, str, type Ctx } from '../shared/http.ts';
import { checkNpc, validateNpc } from '../shared/npc.ts';
import { storytellerOnly, tableReadable } from '../shared/perms.ts';
import { isConflict } from '../shared/store.ts';

const BOTCH_RULES = ['zero-with-a-one-is-a-botch', 'only-negative-is-a-botch'] as const;

/** No 0/O, 1/I/L: codes get read aloud across a table. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function inviteCode(length = 8): string {
  const out: string[] = [];
  const bytes = new Uint8Array(1);
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < length) {
    crypto.getRandomValues(bytes);
    if (bytes[0] < limit) out.push(ALPHABET[bytes[0] % ALPHABET.length]);
  }
  return out.join('');
}

function tenets(input: unknown): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 12) throw badRequest('tenets must be a short list.');
  return input.map((t) => String(t).trim().slice(0, 280)).filter(Boolean);
}

async function create(ctx: Ctx, body: any) {
  const name = str(body, 'name', 120);
  const botchRule = body.botchRule === undefined ? BOTCH_RULES[0] : oneOf(body, 'botchRule', BOTCH_RULES);
  const teamId = ID.unique();

  await ctx.store.teams.create({ teamId, name, roles: ['owner', 'storyteller'] });
  await ctx.store.teams.createMembership({ teamId, roles: ['owner', 'storyteller'], userId: ctx.userId });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await ctx.store.create(
        'chronicles',
        ID.unique(),
        {
          name,
          storytellerId: ctx.userId,
          teamId,
          tenets: tenets(body.tenets),
          currentSceneId: null,
          inviteCode: inviteCode(),
          botchRule,
          turnSerial: 0,
        },
        tableReadable(teamId),
      );
      return decodeChronicle(row);
    } catch (e) {
      if (!isConflict(e)) throw e; // invite code collision: roll another
    }
  }
  throw new Error('could not mint a unique invite code');
}

async function join(ctx: Ctx, body: any) {
  const code = str(body, 'inviteCode', 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [row] = await ctx.store.list('chronicles', [Query.equal('inviteCode', code), Query.limit(1)]);
  if (!row) throw notFound('Invite code');
  const chronicle = decodeChronicle(row);

  const { memberships } = await ctx.store.teams.listMemberships({
    teamId: chronicle.teamId,
    queries: [Query.equal('userId', ctx.userId)],
  });
  if (!memberships.some((m) => m.userId === ctx.userId)) {
    await ctx.store.teams.createMembership({ teamId: chronicle.teamId, roles: ['player'], userId: ctx.userId });
  }
  // The code stays on a team-readable row: anyone already at the table could
  // invite a friend anyway, and rotateInvite is the ST's answer to a leak.
  return chronicle;
}

async function rotateInvite(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  requireStoryteller(ctx, chronicle);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await ctx.store.update('chronicles', chronicle.$id, { inviteCode: inviteCode() });
      return { inviteCode: row.inviteCode };
    } catch (e) {
      if (!isConflict(e)) throw e;
    }
  }
  throw new Error('could not mint a unique invite code');
}

async function update(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  requireStoryteller(ctx, chronicle);
  const data: Record<string, unknown> = {};
  const name = optStr(body, 'name', 120);
  if (name) data.name = name;
  if (body.botchRule !== undefined) data.botchRule = oneOf(body, 'botchRule', BOTCH_RULES);
  if (body.tenets !== undefined) data.tenets = tenets(body.tenets);
  if (Object.keys(data).length === 0) throw badRequest('Nothing to update.');
  return decodeChronicle(await ctx.store.update('chronicles', chronicle.$id, data));
}

const KINDS = ['merit', 'flaw', 'discipline', 'background', 'rule', 'clan', 'power', 'path', 'trait', 'archetype', 'equipment', 'concept', 'ritual'] as const;

async function saveEntry(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  requireStoryteller(ctx, chronicle);
  const kind = oneOf(body, 'kind', KINDS);
  const data = {
    chronicleId: chronicle.$id,
    kind,
    name: str(body, 'name', 60),
    // Only merits and flaws have a cost; the rest carry none.
    points: kind === 'merit' || kind === 'flaw' ? int(body, 'points', 1, 7) : null,
    summary: optStr(body, 'summary', 2000) ?? '',
    page: optStr(body, 'page', 60) ?? '',
  };

  // Names are how a sheet finds its entry, so they're unique within a kind.
  const same = await ctx.store.list('library', [Query.equal('chronicleId', chronicle.$id), Query.equal('kind', kind), Query.limit(500)]);
  const entryId = optStr(body, 'entryId', 36);
  if (same.some((r) => r.$id !== entryId && String(r.name).toLowerCase() === data.name.toLowerCase())) {
    throw new HttpError(409, 'duplicate', `There's already a ${kind} called ${data.name}.`);
  }

  if (entryId) {
    const existing = await ctx.store.find('library', entryId);
    if (!existing || existing.chronicleId !== chronicle.$id) throw notFound('Entry');
    await ctx.store.update('library', entryId, data);
    return { entryId };
  }
  const id = ID.unique();
  await ctx.store.create('library', id, data, tableReadable(chronicle.teamId));
  return { entryId: id };
}

async function removeEntry(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  requireStoryteller(ctx, chronicle);
  const entryId = str(body, 'entryId', 36);
  const existing = await ctx.store.find('library', entryId);
  if (!existing || existing.chronicleId !== chronicle.$id) throw notFound('Entry');
  await ctx.store.remove('library', entryId);
  return { entryId };
}

async function saveNpc(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  requireStoryteller(ctx, chronicle);
  const npcId = optStr(body, 'npcId', 36);
  const fields = (body.npc ?? {}) as Record<string, unknown>;
  if (typeof fields !== 'object' || Array.isArray(fields)) throw badRequest('npc must be an object.');

  if (npcId) {
    const existing = await ctx.store.find('npcs', npcId);
    if (!existing || existing.chronicleId !== chronicle.$id) throw notFound('NPC');
    const data = validateNpc(fields, true);
    if (Object.keys(data).length === 0) throw badRequest('Nothing to change.');
    checkNpc({ ...existing, ...data });
    await ctx.store.update('npcs', npcId, data);
    return { npcId };
  }
  const data = { chronicleId: chronicle.$id, ...validateNpc(fields, false) };
  checkNpc(data);
  const id = ID.unique();
  await ctx.store.create('npcs', id, data, storytellerOnly(chronicle.teamId));
  return { npcId: id };
}

async function removeNpc(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  requireStoryteller(ctx, chronicle);
  const npcId = str(body, 'npcId', 36);
  const existing = await ctx.store.find('npcs', npcId);
  if (!existing || existing.chronicleId !== chronicle.$id) throw notFound('NPC');
  await ctx.store.remove('npcs', npcId);
  return { npcId };
}

export async function handler(ctx: Ctx, body: any) {
  switch (oneOf(body, 'action', ['create', 'join', 'rotateInvite', 'update', 'saveEntry', 'removeEntry', 'saveNpc', 'removeNpc'] as const)) {
    case 'saveNpc':
      return saveNpc(ctx, body);
    case 'removeNpc':
      return removeNpc(ctx, body);
    case 'saveEntry':
      return saveEntry(ctx, body);
    case 'removeEntry':
      return removeEntry(ctx, body);
    case 'create':
      return create(ctx, body);
    case 'join':
      return join(ctx, body);
    case 'rotateInvite':
      return rotateInvite(ctx, body);
    case 'update':
      return update(ctx, body);
  }
}

export default entry('chronicle', handler);
