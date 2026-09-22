/**
 * The only way character state changes.
 *
 * Appwrite has no conditional update, so compare-and-swap is built out of two
 * things it does have: primary keys and transactions. Every mutation writes a
 * ledger row whose id is `${characterId}.v${version + 1}` in the same
 * transaction as the character update. Two writers that both read version 5
 * both try to create `….v6`; the database accepts exactly one, the other's
 * commit fails with 409 and nothing it staged is applied. The loser re-reads
 * version 6 and recomputes from fresh state.
 *
 * That is a real CAS, not a read-back check: a stale write is rejected by the
 * database, and the ledger it leaves behind is an append-only history of every
 * change to every sheet — which the session log export gets for free.
 *
 * Callers pass deltas (take 2 lethal, spend 1 blood); `compute` turns the
 * delta into absolute values against whatever state won the race.
 */

import { decodeCharacter, encodePatch, type Character, type CharacterPatch } from './codec.ts';
import { HttpError, type Ctx } from './http.ts';
import { storytellerOnly } from './perms.ts';
import { isConflict, type Tx } from './store.ts';

export const CAS_ATTEMPTS = 5;

export interface Decision<T> {
  patch: CharacterPatch;
  /** One line for the ledger and the ST's log. */
  summary: string;
  /** Extra writes that must land with this version or not at all. */
  stage?: (tx: Tx, next: Character) => Promise<void>;
  result: T;
}

export async function mutateCharacter<T>(
  ctx: Ctx,
  characterId: string,
  fn: string,
  teamId: string,
  compute: (current: Character, attempt: number) => Decision<T> | Promise<Decision<T>>,
): Promise<{ character: Character; result: T }> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const current = decodeCharacter(await ctx.store.get('characters', characterId));
    // Refusals thrown from compute propagate untouched: they are answers, not conflicts.
    const decision = await compute(current, attempt);
    const version = current.version + 1;
    const next: Character = { ...current, ...decision.patch, version };

    try {
      await ctx.store.transaction(async (tx) => {
        await tx.create(
          'ledger',
          ledgerId(characterId, version),
          {
            chronicleId: current.chronicleId,
            characterId,
            version,
            fn,
            actorId: ctx.userId,
            summary: decision.summary.slice(0, 500),
            patch: JSON.stringify(decision.patch),
          },
          storytellerOnly(teamId),
        );
        await tx.update('characters', characterId, { ...encodePatch(decision.patch), version });
        await decision.stage?.(tx, next);
      });
      ctx.log(`${fn} ${characterId} v${version}: ${decision.summary}`);
      return { character: next, result: decision.result };
    } catch (e) {
      if (!isConflict(e)) throw e;
      await backoff(attempt);
    }
  }
  throw new HttpError(
    409,
    'contended',
    'Too many hands on this sheet at once. Nothing was changed — try again.',
  );
}

export function ledgerId(characterId: string, version: number): string {
  return `${characterId}.v${version}`;
}

function backoff(attempt: number): Promise<void> {
  const ms = 15 * 2 ** attempt + Math.floor(Math.random() * 15);
  return new Promise((r) => setTimeout(r, ms));
}
