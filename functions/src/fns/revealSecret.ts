/**
 * Coterie — revealSecret
 *
 * Storyteller-only. Adds one user to a secret's readers. Appwrite delivers a
 * realtime event only to sockets that can read the row after the change, so
 * the player it's revealed to receives it and the rest of the table receives
 * nothing — not a filtered event, no event.
 *
 * The one leak worth naming: players who already held the secret receive the
 * update too, and visibleTo tells them who else now knows. That's arguably the
 * fiction working as intended; it's written down so it's a choice, not a bug.
 *
 * Body: secretId, userId
 */

import { loadChronicle, requireStoryteller } from '../shared/auth.ts';
import { decodeCharacter } from '../shared/codec.ts';
import { badRequest, entry, notFound, str, type Ctx } from '../shared/http.ts';
import { secretPerms } from '../shared/perms.ts';
import { knownCount, memberIds } from '../shared/secrets.ts';

export async function handler(ctx: Ctx, body: any) {
  const secretId = str(body, 'secretId', 36);
  const userId = str(body, 'userId', 36);

  const secret = await ctx.store.find('secrets', secretId);
  if (!secret) throw notFound('Secret');
  const chronicle = await loadChronicle(ctx, secret.chronicleId);
  requireStoryteller(ctx, chronicle);

  if (!(await memberIds(ctx, chronicle.teamId)).has(userId)) {
    throw badRequest('A secret can only be shown to someone at this table.');
  }

  const current: string[] = secret.visibleTo ?? [];
  if (current.includes(userId) || userId === chronicle.storytellerId) {
    return { secretId, visibleTo: current, unchanged: true };
  }
  const visibleTo = [...current, userId];

  let subjectOwnerId: string | null = null;
  if (secret.subjectCharacterId) {
    const row = await ctx.store.find('characters', secret.subjectCharacterId);
    if (row) subjectOwnerId = decodeCharacter(row).ownerId;
  }
  const seal = await ctx.store.find('seals', secretId);

  await ctx.store.transaction(async (tx) => {
    await tx.update('secrets', secretId, { visibleTo }, secretPerms(chronicle.teamId, visibleTo));
    if (seal) await tx.update('seals', secretId, { knownCount: knownCount(visibleTo, subjectOwnerId) });
  });

  return { secretId, visibleTo };
}

export default entry('revealSecret', handler);
