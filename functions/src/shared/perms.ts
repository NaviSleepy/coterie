/**
 * Permission strings, built in one place so the matrix in the README is
 * something you can grep for. Same wire format as node-appwrite's
 * Permission/Role helpers; kept dependency-free so the tests can assert on
 * exact strings.
 */

export const team = (teamId: string) => `team:${teamId}`;
export const storytellers = (teamId: string) => `team:${teamId}/storyteller`;
export const user = (userId: string) => `user:${userId}`;

export const read = (role: string) => `read("${role}")`;
export const update = (role: string) => `update("${role}")`;
export const remove = (role: string) => `delete("${role}")`;

/** Everyone at the table can see it. Nobody but a Function writes it. */
export function tableReadable(teamId: string): string[] {
  return [read(team(teamId))];
}

/** Behind the screen. */
export function storytellerOnly(teamId: string): string[] {
  return [read(storytellers(teamId))];
}

/** A character's mechanical row: its owner and the Storyteller read it. No one writes it. */
export function characterPerms(teamId: string, ownerId: string): string[] {
  return [read(user(ownerId)), read(storytellers(teamId))];
}

/** The cosmetic profile: same readers, and the owner may write. */
export function profilePerms(teamId: string, ownerId: string): string[] {
  return [read(user(ownerId)), read(storytellers(teamId)), update(user(ownerId))];
}

/** A secret: the Storyteller, plus exactly the users it has been revealed to. */
export function secretPerms(teamId: string, visibleTo: string[]): string[] {
  return [read(storytellers(teamId)), ...visibleTo.map((id) => read(user(id)))];
}
