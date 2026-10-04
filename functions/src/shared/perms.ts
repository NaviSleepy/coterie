/**
 * Permission strings, built in one place so the matrix in docs/TECHNICAL.md is
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

/** Everyone at the table reads it and may edit it directly: the coterie's shared notes. */
export function tableEditable(teamId: string): string[] {
  return [read(team(teamId)), update(team(teamId))];
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

/** A creation request: the player who sent it and the Storyteller. */
export function requestPerms(teamId: string, ownerId: string): string[] {
  return [read(user(ownerId)), read(storytellers(teamId))];
}

/** A portrait file: its owner reads and replaces it; the Storyteller reads it and may delete it with the character. */
export function portraitPerms(teamId: string, ownerId: string): string[] {
  return [read(user(ownerId)), update(user(ownerId)), remove(user(ownerId)), read(storytellers(teamId)), remove(storytellers(teamId))];
}

/** A secret: the Storyteller, plus exactly the users it has been revealed to. */
export function secretPerms(teamId: string, visibleTo: string[]): string[] {
  return [read(storytellers(teamId)), ...visibleTo.map((id) => read(user(id)))];
}
