/**
 * Coterie — createSecret
 *
 * The Storyteller writes something down behind the screen, optionally about a
 * character and optionally already known to some players. If it concerns a
 * character, a seal row goes to that character's owner: they learn a secret
 * about them exists and how many others hold it, and nothing of what it says.
 *
 * Body: chronicleId, body, subjectCharacterId?, visibleTo?: userId[]
 */

import { ID } from 'node-appwrite';

import { loadChronicle, requireStoryteller } from '../shared/auth.ts';
import { decodeCharacter } from '../shared/codec.ts';
import { badRequest, entry, optStr, str, type Ctx } from '../shared/http.ts';
import { secretPerms } from '../shared/perms.ts';
import { knownCount, memberIds, sealPerms } from '../shared/secrets.ts';

export async function handler(ctx: Ctx, body: any) {
  const chronicle = await loadChronicle(ctx, str(body, 'chronicleId', 36));
  requireStoryteller(ctx, chronicle);

  const text = str(body, 'body', 5000);
  const subjectCharacterId = optStr(body, 'subjectCharacterId', 36) ?? null;
  const requested: string[] = Array.isArray(body.visibleTo) ? body.visibleTo.map(String) : [];

  const members = await memberIds(ctx, chronicle.teamId);
  const stranger = requested.find((id) => !members.has(id));
  if (stranger) throw badRequest('A secret can only be shown to someone at this table.');
  const visibleTo = [...new Set(requested)].filter((id) => id !== chronicle.storytellerId);

  let subjectOwnerId: string | null = null;
  if (subjectCharacterId) {
    const row = await ctx.store.find('characters', subjectCharacterId);
    if (!row || row.chronicleId !== chronicle.$id) throw badRequest('That character is not in this chronicle.');
    subjectOwnerId = decodeCharacter(row).ownerId;
  }

  const secretId = ID.unique();
  await ctx.store.transaction(async (tx) => {
    await tx.create(
      'secrets',
      secretId,
      { chronicleId: chronicle.$id, subjectCharacterId, body: text, visibleTo },
      secretPerms(chronicle.teamId, visibleTo),
    );
    if (subjectCharacterId && subjectOwnerId) {
      await tx.create(
        'seals',
        secretId,
        {
          chronicleId: chronicle.$id,
          subjectCharacterId,
          knownCount: knownCount(visibleTo, subjectOwnerId),
        },
        sealPerms(chronicle.teamId, subjectOwnerId),
      );
    }
  });

  return { secretId, visibleTo };
}

export default entry('createSecret', handler);
