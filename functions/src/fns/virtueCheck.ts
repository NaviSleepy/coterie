/**
 * Coterie — virtueCheck
 *
 * One entry point for the three rolls that use Virtues rather than
 * Attribute + Ability. All three route through the same roll pipeline as
 * rollPool, so the dice arithmetic lives in exactly one place; what differs is
 * which Virtue is read and what is written afterwards.
 *
 *   degeneration  Conscience/Conviction. Storyteller only, and the sin that
 *                 triggered it is required and logged to the feed. A failed or
 *                 botched check drops the Path rating by one, in the same
 *                 committed version as the roll, and the drop is visible to
 *                 the table. A tool that makes this one click cheapens it.
 *   frenzy        Self-Control/Instinct against a provocation.
 *   rötschreck    Courage against fire or sunlight.
 *
 * Willpower cannot be spent on any of them.
 *
 * Body: characterId, kind, sin (degeneration), difficulty (ST only)
 */

import { traitDots, traitLabel, virtueForCheck, type VirtueCheckKind } from '../../../engine/src/index.ts';
import { loadCharacterFor } from '../shared/auth.ts';
import { sheetOf } from '../shared/codec.ts';
import { entry, forbidden, oneOf, optInt, optStr, str, type Ctx } from '../shared/http.ts';
import { executeRoll, type PublicRoll } from '../shared/roll.ts';

const KINDS = ['degeneration', 'frenzy', 'rotschreck'] as const satisfies readonly VirtueCheckKind[];

const LABEL: Record<VirtueCheckKind, string> = {
  degeneration: 'Degeneration',
  frenzy: 'Frenzy',
  rotschreck: 'Rötschreck',
};

export async function handler(ctx: Ctx, body: any): Promise<PublicRoll> {
  const access = await loadCharacterFor(ctx, str(body, 'characterId', 36));
  const kind = oneOf(body, 'kind', KINDS);

  if (!access.asStoryteller) {
    if (kind === 'degeneration') throw forbidden('Only the Storyteller calls for a degeneration check.');
    if (body.difficulty !== undefined) throw forbidden('Only the Storyteller sets difficulty.');
  }

  const c = access.character;
  const virtue = virtueForCheck(c.virtues, kind);
  const dots = traitDots(sheetOf(c), virtue);
  const sin = kind === 'degeneration' ? str(body, 'sin', 280) : optStr(body, 'provocation', 280);

  return executeRoll(ctx, access, {
    kind,
    basePool: dots,
    label: `${LABEL[kind]} · ${traitLabel(virtue)}`,
    specialtyApplies: false,
    modifier: 0,
    difficulty: access.asStoryteller ? optInt(body, 'difficulty', 2, 10) : undefined,
    spendWillpower: false,
    visibility: 'table',
    note: sin,
    after:
      kind === 'degeneration'
        ? (result, current) => {
            if (result.outcome === 'success') return { patch: {}, note: `${current.path} holds at ${current.pathRating}` };
            const pathRating = Math.max(0, current.pathRating - 1);
            return {
              patch: { pathRating },
              note: `${current.path} falls to ${pathRating}`,
            };
          }
        : undefined,
  });
}

export default entry('virtueCheck', handler);
