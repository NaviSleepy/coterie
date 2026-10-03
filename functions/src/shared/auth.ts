/**
 * Who is asking, and what they are to this chronicle. Authorization is checked
 * in every Function, never inferred from the fact that a call arrived.
 */

import { Query } from 'node-appwrite';

import { decodeCharacter, type Character } from './codec.ts';
import { forbidden, notFound, type Ctx } from './http.ts';
import type { CreationOverrides } from '../../../engine/src/index.ts';
import { parseJson } from './codec.ts';
import type { Row } from './store.ts';

export interface Chronicle {
  $id: string;
  name: string;
  storytellerId: string;
  teamId: string;
  tenets: string[];
  currentSceneId: string | null;
  inviteCode: string;
  botchRule: 'zero-with-a-one-is-a-botch' | 'only-negative-is-a-botch';
  turnSerial: number;
  creationRules: CreationOverrides;
}

export function decodeChronicle(row: Row): Chronicle {
  return {
    $id: row.$id,
    name: row.name,
    storytellerId: row.storytellerId,
    teamId: row.teamId,
    tenets: row.tenets ?? [],
    currentSceneId: row.currentSceneId || null,
    inviteCode: row.inviteCode,
    botchRule: row.botchRule ?? 'zero-with-a-one-is-a-botch',
    turnSerial: row.turnSerial ?? 0,
    creationRules: parseJson<CreationOverrides>(row.creationRules, {}),
  };
}

export async function loadChronicle(ctx: Ctx, chronicleId: string): Promise<Chronicle> {
  const row = await ctx.store.find('chronicles', chronicleId);
  if (!row) throw notFound('Chronicle');
  return decodeChronicle(row);
}

export function isStoryteller(ctx: Ctx, chronicle: Chronicle): boolean {
  return chronicle.storytellerId === ctx.userId;
}

export function requireStoryteller(ctx: Ctx, chronicle: Chronicle): void {
  if (!isStoryteller(ctx, chronicle)) throw forbidden('Only the Storyteller can do that.');
}

/** True when the caller holds any membership in the chronicle's team. */
export async function isMember(ctx: Ctx, chronicle: Chronicle): Promise<boolean> {
  if (isStoryteller(ctx, chronicle)) return true;
  const { memberships } = await ctx.store.teams.listMemberships({
    teamId: chronicle.teamId,
    queries: [Query.equal('userId', ctx.userId)],
  });
  return memberships.some((m) => m.userId === ctx.userId);
}

export async function requireMember(ctx: Ctx, chronicle: Chronicle): Promise<void> {
  if (!(await isMember(ctx, chronicle))) throw forbidden('You are not at this table.');
}

export interface Access {
  character: Character;
  chronicle: Chronicle;
  asStoryteller: boolean;
}

/**
 * A character's owner or its chronicle's Storyteller. Anyone else gets a 403
 * that says nothing about whether the character exists — a player probing ids
 * learns the same thing from a real id and a made-up one.
 */
export async function loadCharacterFor(ctx: Ctx, characterId: string): Promise<Access> {
  const row = await ctx.store.find('characters', characterId);
  if (!row) throw forbidden();
  const character = decodeCharacter(row);
  const chronicle = await loadChronicle(ctx, character.chronicleId);
  const asStoryteller = isStoryteller(ctx, chronicle);
  if (character.ownerId !== ctx.userId && !asStoryteller) throw forbidden();
  return { character, chronicle, asStoryteller };
}

export async function loadCurrentScene(ctx: Ctx, chronicle: Chronicle): Promise<Row | null> {
  if (!chronicle.currentSceneId) return null;
  return ctx.store.find('scenes', chronicle.currentSceneId);
}
