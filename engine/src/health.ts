import type { DamageType, HealthTrack } from './types.ts';

/**
 * Seven boxes. The penalty from the deepest marked box comes off every dice
 * pool the character rolls until it heals — which is the single most useful
 * thing this app does that a paper sheet doesn't, because nobody forgets.
 */
export const HEALTH_LEVELS = [
  { name: 'Bruised', penalty: 0 },
  { name: 'Hurt', penalty: -1 },
  { name: 'Injured', penalty: -1 },
  { name: 'Wounded', penalty: -2 },
  { name: 'Mauled', penalty: -2 },
  { name: 'Crippled', penalty: -5 },
  { name: 'Incapacitated', penalty: -5 },
] as const;

export const HEALTH_BOXES = HEALTH_LEVELS.length;

export const EMPTY_TRACK: HealthTrack = { bashing: 0, lethal: 0, aggravated: 0 };

export function totalDamage(track: HealthTrack): number {
  return track.bashing + track.lethal + track.aggravated;
}

export function isIncapacitated(track: HealthTrack): boolean {
  return totalDamage(track) >= HEALTH_BOXES;
}

/**
 * The deepest marked box, by name. Undefined when the character is unhurt.
 */
export function woundLevel(track: HealthTrack): string | undefined {
  const marked = Math.min(totalDamage(track), HEALTH_BOXES);
  return marked === 0 ? undefined : HEALTH_LEVELS[marked - 1].name;
}

/**
 * Returned as a positive number to subtract. A pool of 5 at Wounded is 5 − 2.
 * Incapacitated returns the Crippled penalty, but callers should be checking
 * isIncapacitated() first — an incapacitated character doesn't roll, it lies
 * there.
 */
export function woundPenalty(track: HealthTrack): number {
  const marked = Math.min(totalDamage(track), HEALTH_BOXES);
  if (marked === 0) return 0;
  return Math.abs(HEALTH_LEVELS[marked - 1].penalty);
}

/**
 * Renders the track the way the sheet draws it: worst damage sits at the top,
 * so a character with one aggravated and two bashing shows agg in Bruised and
 * bashing in Hurt and Injured. Counts alone are enough to derive this, which is
 * why the schema stores three integers instead of an array of seven cells.
 */
export function trackBoxes(track: HealthTrack): (DamageType | null)[] {
  const boxes: (DamageType | null)[] = [];
  for (let i = 0; i < track.aggravated && boxes.length < HEALTH_BOXES; i++) boxes.push('aggravated');
  for (let i = 0; i < track.lethal && boxes.length < HEALTH_BOXES; i++) boxes.push('lethal');
  for (let i = 0; i < track.bashing && boxes.length < HEALTH_BOXES; i++) boxes.push('bashing');
  while (boxes.length < HEALTH_BOXES) boxes.push(null);
  return boxes;
}

export interface DamageOutcome {
  track: HealthTrack;
  /** Boxes newly marked in empty space. */
  marked: number;
  /** Boxes upgraded in severity because the track was already full. */
  upgraded: number;
  /** Damage that landed on a track with nothing left to escalate. */
  discarded: number;
  incapacitated: boolean;
  /** True when this blow pushed them across the line. */
  newlyIncapacitated: boolean;
}

/**
 * Deltas, never absolutes. applyDamage(+2) composes when the player and the
 * Storyteller both act on the same attack; setHealth(2) silently eats one of
 * them and somebody dies who shouldn't have.
 *
 * Overflow escalates: excess bashing upgrades an existing bashing box to
 * lethal, excess lethal upgrades bashing to lethal or lethal to aggravated,
 * excess aggravated upgrades the least severe box it can find. Tables vary on
 * the fine print here; this is the common reading and it lives in one function
 * so a house rule is a one-file change.
 */
export function applyDamage(
  track: HealthTrack,
  amount: number,
  type: DamageType,
): DamageOutcome {
  if (!Number.isInteger(amount)) {
    throw new TypeError('damage must be a whole number of boxes');
  }

  const before = { ...track };
  const next: HealthTrack = { ...track };

  if (amount < 0) {
    // A negative delta un-marks boxes of that type — the Storyteller correcting
    // a miscount, not healing, which spends blood and goes through feedAndHeal.
    const removed = Math.min(-amount, next[type]);
    next[type] -= removed;
    return {
      track: next,
      marked: -removed,
      upgraded: 0,
      discarded: -amount - removed,
      incapacitated: isIncapacitated(next),
      newlyIncapacitated: false,
    };
  }

  let remaining = amount;
  let marked = 0;
  let upgraded = 0;
  let discarded = 0;

  const free = HEALTH_BOXES - totalDamage(next);
  const fills = Math.min(remaining, Math.max(free, 0));
  next[type] += fills;
  marked += fills;
  remaining -= fills;

  while (remaining > 0) {
    const victim = leastSevereUpgradable(next, type);
    if (!victim) {
      discarded += remaining;
      break;
    }
    next[victim.from] -= 1;
    next[victim.to] += 1;
    upgraded += 1;
    remaining -= 1;
  }

  const wasDown = isIncapacitated(before);
  const isDown = isIncapacitated(next);

  return {
    track: next,
    marked,
    upgraded,
    discarded,
    incapacitated: isDown,
    newlyIncapacitated: isDown && !wasDown,
  };
}

/**
 * Which single box this point of overflow escalates, if any.
 *
 * Bashing can only ever push a box up to lethal. Lethal prefers to consume a
 * bashing box before it starts making aggravated. Aggravated eats the topmost
 * thing that isn't already aggravated, which on the rendered track is lethal.
 */
function leastSevereUpgradable(
  track: HealthTrack,
  incoming: DamageType,
): { from: DamageType; to: DamageType } | undefined {
  if (incoming === 'bashing') {
    return track.bashing > 0 ? { from: 'bashing', to: 'lethal' } : undefined;
  }
  if (incoming === 'lethal') {
    if (track.bashing > 0) return { from: 'bashing', to: 'lethal' };
    if (track.lethal > 0) return { from: 'lethal', to: 'aggravated' };
    return undefined;
  }
  if (track.lethal > 0) return { from: 'lethal', to: 'aggravated' };
  if (track.bashing > 0) return { from: 'bashing', to: 'aggravated' };
  return undefined;
}

/** Bashing and lethal cost one blood per box. Aggravated is slow and expensive. */
export const BLOOD_PER_BOX: Record<DamageType, number> = {
  bashing: 1,
  lethal: 1,
  aggravated: 5,
};

export interface HealOutcome {
  track: HealthTrack;
  healed: number;
  bloodSpent: number;
  type: DamageType;
}

/**
 * Heals the most severe damage the caller asked for, cheapest first within that
 * type. Returns what actually changed so the UI can narrate it rather than
 * silently sliding numbers around.
 */
export function healDamage(
  track: HealthTrack,
  boxes: number,
  type: DamageType,
  bloodAvailable: number,
): HealOutcome {
  const cost = BLOOD_PER_BOX[type];
  const affordable = Math.floor(bloodAvailable / cost);
  const healed = Math.max(0, Math.min(boxes, track[type], affordable));
  const next: HealthTrack = { ...track };
  next[type] -= healed;
  return { track: next, healed, bloodSpent: healed * cost, type };
}
