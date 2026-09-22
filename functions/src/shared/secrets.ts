/** Helpers shared by createSecret and revealSecret. */

import type { Ctx } from './http.ts';
import { read, storytellers, user } from './perms.ts';

export async function memberIds(ctx: Ctx, teamId: string): Promise<Set<string>> {
  const { memberships } = await ctx.store.teams.listMemberships({ teamId });
  return new Set(memberships.map((m) => m.userId));
}

/** The seal is for the subject's player; the Storyteller sees it too. */
export function sealPerms(teamId: string, ownerId: string): string[] {
  return [read(storytellers(teamId)), read(user(ownerId))];
}

/** Everyone who holds it, minus the subject's own player and the ST. */
export function knownCount(visibleTo: string[], subjectOwnerId: string | null): number {
  return visibleTo.filter((id) => id !== subjectOwnerId).length;
}
