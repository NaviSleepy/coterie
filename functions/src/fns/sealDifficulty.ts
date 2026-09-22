/**
 * Coterie — sealDifficulty
 *
 * The Storyteller sets the difficulty of a character's next roll without the
 * player learning it. The number goes into sealedDifficulties (ST-readable
 * only); the character row gets difficultySealed = true so the player sees a
 * closed envelope where the number would be — sealed, not absent. The next
 * rollPool or virtueCheck for that character consumes it.
 *
 * Body: characterId, difficulty (2–10) | clear: true, note?
 */

import { loadCharacterFor, requireStoryteller } from '../shared/auth.ts';
import { entry, int, optStr, str, type Ctx } from '../shared/http.ts';
import { mutateCharacter } from '../shared/mutate.ts';
import { storytellerOnly } from '../shared/perms.ts';

export async function handler(ctx: Ctx, body: any) {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  requireStoryteller(ctx, access.chronicle);

  const clear = body.clear === true;
  const difficulty = clear ? 0 : int(body, 'difficulty', 2, 10);
  const note = optStr(body, 'note', 160) ?? null;
  const { teamId } = access.chronicle;

  const { character } = await mutateCharacter(ctx, access.character.$id, 'sealDifficulty', teamId, async (c) => {
    const existing = await ctx.store.find('sealedDifficulties', c.$id);
    return {
      patch: { difficultySealed: !clear },
      summary: clear ? 'difficulty seal cleared' : 'difficulty sealed',
      stage: async (tx) => {
        if (clear) {
          if (existing) await tx.remove('sealedDifficulties', c.$id);
        } else if (existing) {
          await tx.update('sealedDifficulties', c.$id, { difficulty, note });
        } else {
          await tx.create(
            'sealedDifficulties',
            c.$id,
            { chronicleId: c.chronicleId, difficulty, note },
            storytellerOnly(teamId),
          );
        }
      },
      result: null,
    };
  });

  return { characterId: character.$id, sealed: character.difficultySealed, difficulty: clear ? null : difficulty };
}

export default entry('sealDifficulty', handler);
