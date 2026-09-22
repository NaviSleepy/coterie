/**
 * Coterie — rollPool
 *
 * The client never rolls. It asks. This Function is the only writer of the
 * rolls and rollSecrets tables.
 *
 * A player asks by naming traits — `["dexterity", "firearms"]` — and the pool
 * is summed off the sheet this Function reads from the database. The player
 * never sends a dice count, a difficulty or a modifier: a request is a thing a
 * player can edit in devtools, so those fields are the Storyteller's alone,
 * and a player who sends one gets a 403 rather than a quietly-ignored field.
 *
 * Two rows come out of one roll, and that split is the whole design:
 *
 *   rolls        the dice, the label, the outcome  → readable by the table
 *   rollSecrets  the difficulty                    → readable by the ST alone
 *
 * Appwrite's permissions are row-level, not column-level, so a hidden
 * difficulty can't be expressed on the same row as the dice it applied to.
 * Moving the secret to its own row with its own permissions means a player's
 * websocket is never delivered the number at all — not delivered and filtered
 * client-side, which is theatre, but never sent.
 *
 * Body:
 *   characterId     required
 *   traits          one or two trait keys; required unless the ST sends basePool
 *   specialty       a trait key from `traits` to claim its specialty (4+ dots, checked)
 *   spendWillpower  once per turn, checked against the scene
 *   — Storyteller only —
 *   basePool, label, modifier, difficulty, visibility: "table" | "storyteller"
 */

import { buildPool } from '../../../engine/src/index.ts';
import { loadCharacterFor } from '../shared/auth.ts';
import { sheetOf } from '../shared/codec.ts';
import { badRequest, entry, forbidden, int, optInt, optStr, type Ctx } from '../shared/http.ts';
import { executeRoll, type PublicRoll } from '../shared/roll.ts';

const STORYTELLER_ONLY = ['basePool', 'label', 'modifier', 'difficulty', 'visibility'] as const;

export async function handler(ctx: Ctx, body: any): Promise<PublicRoll> {
  const characterId = optStr(body, 'characterId', 36);
  if (!characterId) throw badRequest('characterId is required.');

  const access = await loadCharacterFor(ctx, characterId);

  if (!access.asStoryteller) {
    const smuggled = STORYTELLER_ONLY.filter((k) => body[k] !== undefined && body[k] !== null);
    if (smuggled.length > 0) {
      throw forbidden(`Only the Storyteller sets ${smuggled.join(', ')}.`);
    }
  }

  let basePool: number;
  let label: string;
  let specialtyApplies = false;

  if (Array.isArray(body.traits) && body.traits.length > 0) {
    const specialty = optStr(body, 'specialty', 40);
    const built = buildPool(sheetOf(access.character), body.traits.map(String), specialty);
    if (!built.ok) throw badRequest(built.message);
    ({ basePool, label, specialtyApplies } = built.pool);
    if (specialty && !specialtyApplies) {
      throw badRequest('That specialty needs four dots in the trait and a specialty on the sheet.');
    }
  } else if (access.asStoryteller && body.basePool !== undefined) {
    basePool = int(body, 'basePool', 0, 40);
    label = optStr(body, 'label', 120) ?? `${basePool} dice`;
  } else {
    throw badRequest('Name the traits to roll.');
  }

  if (access.asStoryteller) label = optStr(body, 'label', 120) ?? label;

  return executeRoll(ctx, access, {
    kind: 'pool',
    basePool,
    label,
    specialtyApplies,
    modifier: optInt(body, 'modifier', -20, 20) ?? 0,
    difficulty: optInt(body, 'difficulty', 2, 10),
    spendWillpower: body.spendWillpower === true,
    visibility: access.asStoryteller && body.visibility === 'storyteller' ? 'storyteller' : 'table',
  });
}

export default entry('rollPool', handler);
