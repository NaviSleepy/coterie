/**
 * Coterie — scene
 *
 * Storyteller only. Scenes carry the turn counter the per-turn blood cap and
 * the once-a-turn Willpower spend are scoped to.
 *
 * Turn identity is chronicle-wide: chronicle.turnSerial only ever goes up, and
 * a scene's turn N maps to turnBase + N. So a blood counter stamped in the
 * third turn of one scene can't be mistaken for the third turn of the next.
 *
 *   start           New scene at turn 1; becomes the chronicle's current scene.
 *   advance         Next turn. Resets every cap at once without touching a sheet.
 *   setInitiative   ST-supplied order, NPCs included: [{label, characterId?, value}].
 *   rollInitiative  Server rolls Dexterity + Wits + 1d10 for each PC participant
 *                   and merges any NPC entries passed in.
 *   end             No current scene; caps apply per action until the next one.
 *
 * Body: action, chronicleId, ...
 */

import { ID, Query } from 'node-appwrite';

import { loadChronicle, requireStoryteller, type Chronicle } from '../shared/auth.ts';
import { decodeCharacter } from '../shared/codec.ts';
import { badRequest, entry, oneOf, refused, str, type Ctx } from '../shared/http.ts';
import { tableReadable } from '../shared/perms.ts';
import type { Row } from '../shared/store.ts';

export interface InitiativeEntry {
  label: string;
  characterId?: string;
  value: number;
}

function sortInitiative(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function parseEntries(input: unknown): InitiativeEntry[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 30) throw badRequest('entries must be a list.');
  return input.map((e: any) => {
    const label = typeof e?.label === 'string' ? e.label.trim().slice(0, 60) : '';
    if (!label || !Number.isInteger(e.value) || e.value < 0 || e.value > 40) {
      throw badRequest('Each initiative entry needs a label and a whole-number value.');
    }
    return { label, value: e.value, ...(typeof e.characterId === 'string' ? { characterId: e.characterId } : {}) };
  });
}

async function currentScene(ctx: Ctx, chronicle: Chronicle): Promise<Row> {
  const scene = chronicle.currentSceneId ? await ctx.store.find('scenes', chronicle.currentSceneId) : null;
  if (!scene) throw refused('no-scene', 'There is no scene in progress.');
  return scene;
}

async function start(ctx: Ctx, chronicle: Chronicle, body: any) {
  const name = str(body, 'name', 120);
  const characters = await ctx.store.list('characters', [Query.equal('chronicleId', chronicle.$id), Query.limit(50)]);
  const participants: string[] = Array.isArray(body.participants)
    ? body.participants.map(String).filter((id: string) => characters.some((c) => c.$id === id))
    : characters.map((c) => c.$id);

  const turnBase = chronicle.turnSerial;
  const sceneId = ID.unique();
  const previous = chronicle.currentSceneId;

  await ctx.store.transaction(async (tx) => {
    await tx.create(
      'scenes',
      sceneId,
      { chronicleId: chronicle.$id, name, turn: 1, turnBase, initiative: '[]', participants, active: true },
      tableReadable(chronicle.teamId),
    );
    if (previous) await tx.update('scenes', previous, { active: false });
    await tx.update('chronicles', chronicle.$id, { currentSceneId: sceneId, turnSerial: turnBase + 1 });
  });

  return { sceneId, turn: 1 };
}

async function advance(ctx: Ctx, chronicle: Chronicle) {
  const scene = await currentScene(ctx, chronicle);
  const turn = (scene.turn ?? 1) + 1;
  const serial = (scene.turnBase ?? 0) + turn;
  await ctx.store.transaction(async (tx) => {
    // Initiative is rolled fresh each turn in V20; clear the old order.
    await tx.update('scenes', scene.$id, { turn, initiative: '[]' });
    await tx.update('chronicles', chronicle.$id, { turnSerial: Math.max(chronicle.turnSerial, serial) });
  });
  return { sceneId: scene.$id, turn };
}

async function setInitiative(ctx: Ctx, chronicle: Chronicle, body: any) {
  const scene = await currentScene(ctx, chronicle);
  const initiative = sortInitiative(parseEntries(body.entries));
  await ctx.store.update('scenes', scene.$id, { initiative: JSON.stringify(initiative) });
  return { sceneId: scene.$id, initiative };
}

async function rollInitiative(ctx: Ctx, chronicle: Chronicle, body: any) {
  const scene = await currentScene(ctx, chronicle);
  const npcs = parseEntries(body.entries).filter((e) => !e.characterId);
  const pcs: InitiativeEntry[] = [];
  for (const id of (scene.participants as string[]) ?? []) {
    const row = await ctx.store.find('characters', id);
    if (!row) continue;
    const c = decodeCharacter(row);
    const profile = await ctx.store.find('profiles', id);
    pcs.push({
      label: (profile?.name as string)?.split(' ')[0] ?? 'Unknown',
      characterId: id,
      value: (c.attributes.dexterity ?? 1) + (c.attributes.wits ?? 1) + ctx.die(),
    });
  }
  const initiative = sortInitiative([...pcs, ...npcs]);
  await ctx.store.update('scenes', scene.$id, { initiative: JSON.stringify(initiative) });
  return { sceneId: scene.$id, initiative };
}

async function end(ctx: Ctx, chronicle: Chronicle) {
  const scene = await currentScene(ctx, chronicle);
  await ctx.store.transaction(async (tx) => {
    await tx.update('scenes', scene.$id, { active: false });
    await tx.update('chronicles', chronicle.$id, { currentSceneId: null });
  });
  return { ended: scene.$id };
}

export async function handler(ctx: Ctx, body: any) {
  const action = oneOf(body, 'action', ['start', 'advance', 'setInitiative', 'rollInitiative', 'end'] as const);
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  requireStoryteller(ctx, chronicle);
  switch (action) {
    case 'start':
      return start(ctx, chronicle, body);
    case 'advance':
      return advance(ctx, chronicle);
    case 'setInitiative':
      return setInitiative(ctx, chronicle, body);
    case 'rollInitiative':
      return rollInitiative(ctx, chronicle, body);
    case 'end':
      return end(ctx, chronicle);
  }
}

export default entry('scene', handler);
