/**
 * Coterie — revealRoll
 *
 * Breaking the seal. The Storyteller shows the table the difficulty a roll was
 * made against, and — for a roll made behind the screen — the roll itself.
 *
 * Both rows change permissions in one transaction, so there is no moment where
 * the table can see a hidden roll without its difficulty or vice versa. The
 * players' sockets receive the rows at the instant they become readable, and
 * not before.
 *
 * Body: rollId
 */

import { loadChronicle, requireStoryteller } from '../shared/auth.ts';
import { entry, notFound, str, type Ctx } from '../shared/http.ts';
import { tableReadable } from '../shared/perms.ts';

export async function handler(ctx: Ctx, body: any) {
  const rollId = str(body, 'rollId', 36);
  const secret = await ctx.store.find('rollSecrets', rollId);
  if (!secret) throw notFound('Roll');
  const chronicle = await loadChronicle(ctx, secret.chronicleId);
  requireStoryteller(ctx, chronicle);

  const perms = tableReadable(chronicle.teamId);
  const storytellerPerms: string[] = secret.$permissions ?? [];
  const merged = [...new Set([...storytellerPerms, ...perms])];

  await ctx.store.transaction(async (tx) => {
    await tx.update('rollSecrets', rollId, { revealed: true }, merged);
    await tx.update('rolls', rollId, { revealedDifficulty: secret.difficulty, visibility: 'table' }, merged);
  });

  return { rollId, difficulty: secret.difficulty, revealed: true };
}

export default entry('revealRoll', handler);
