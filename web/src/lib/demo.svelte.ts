/**
 * A table with no server: the Ashen Court from the design mockups, running in
 * the browser so the interface can be seen without an Appwrite project.
 *
 * It is a simulation of the Functions, not a replacement for them — the dice
 * are rolled here, which is exactly what the real app never does. What it does
 * keep honest is disclosure: the world is held privately and projected per
 * viewer with the same rules the row permissions enforce, so switching from
 * player to Storyteller shows what each is and isn't sent.
 */

import {
  applyDamage,
  bloodPerTurn,
  bloodPoolMax,
  buildPool,
  canSpendWillpower,
  cryptoDie,
  feed,
  healDamage,
  remainingThisTurn,
  rollPool,
  spendBlood,
  traitDots,
  traitLabel,
  virtueForCheck,
  type DamageType,
} from '$engine/index.ts';
import { healthOf, parseJson, sheetOf, stateOf, type Character } from '$shared/codec.ts';
import type { AnyRow } from './appwrite';
import { presenceId } from './appwrite';
import { TableState } from './table.svelte';

export const DEMO_ID = 'demo';
export const DEMO_ST = 'demo-st';
export const DEMO_PLAYER = 'demo-isolde';

const T0 = Date.now();
const ago = (min: number) => new Date(T0 - min * 60_000).toISOString();

function row(id: string, data: Record<string, any>, createdMinAgo = 60): AnyRow {
  return { $id: id, $createdAt: ago(createdMinAgo), $updatedAt: ago(createdMinAgo), $permissions: [], ...data };
}

function character(id: string, ownerId: string, c: Partial<Character>): Character {
  const generation = c.generation ?? 13;
  return {
    $id: id,
    chronicleId: DEMO_ID,
    ownerId,
    clan: '',
    sect: 'Camarilla',
    sire: '',
    generation,
    attributes: {},
    abilities: {},
    specialties: [],
    disciplines: [],
    backgrounds: [],
    virtues: { conscience: 3, selfControl: 3, courage: 3 },
    merits: [],
    flaws: [],
    path: 'Humanity',
    pathRating: 7,
    willpowerPermanent: 5,
    willpowerTemporary: 5,
    willpowerSpentTurnRef: -1,
    bloodPool: 10,
    bloodPoolMax: bloodPoolMax(generation),
    bloodPerTurn: bloodPerTurn(generation),
    bloodSpentThisTurn: 0,
    bloodSpentTurnRef: -1,
    healthBashing: 0,
    healthLethal: 0,
    healthAggravated: 0,
    experienceTotal: 0,
    experienceSpent: 0,
    difficultySealed: false,
    version: 0,
    ...c,
  };
}

class Refusal extends Error {}

export class DemoTable extends TableState {
  private world = {
    characters: {} as Record<string, Character>,
    rolls: [] as AnyRow[],
    rollSecrets: {} as Record<string, AnyRow>,
    secrets: {} as Record<string, AnyRow>,
    seals: {} as Record<string, AnyRow>,
    sealed: {} as Record<string, number>,
    proposals: {} as Record<string, AnyRow>,
    library: {} as Record<string, AnyRow>,
  };

  constructor() {
    super(DEMO_ID, DEMO_PLAYER, 'Isolde’s player');
  }

  override async open() {
    this.seed();
    this.status = 'live';
    setInterval(() => (this.now = Date.now()), 1000);
  }

  override async close() {}

  viewAs(who: 'player' | 'storyteller') {
    this.me = who === 'player' ? DEMO_PLAYER : DEMO_ST;
    this.project();
  }

  private seed() {
    this.chronicle = row(DEMO_ID, {
      name: 'The Ashen Court',
      storytellerId: DEMO_ST,
      teamId: 'demo-team',
      currentSceneId: 'demo-scene',
      inviteCode: 'ASHEN234',
      botchRule: 'zero-with-a-one-is-a-botch',
      turnSerial: 3,
    });
    this.scene = row('demo-scene', {
      chronicleId: DEMO_ID,
      name: 'The Rookery Gallery',
      turn: 3,
      turnBase: 0,
      initiative: JSON.stringify([
        { label: 'Dmitri', characterId: 'demo-dmitri', value: 9 },
        { label: 'Isolde', characterId: 'demo-isolde', value: 8 },
        { label: 'Sheriff Aldana', value: 7 },
        { label: 'Ceren', characterId: 'demo-ceren', value: 6 },
        { label: 'Luther', characterId: 'demo-luther', value: 4 },
      ]),
    });
    this.members = [
      { userId: DEMO_ST, name: 'Storyteller', roles: ['owner', 'storyteller'] },
      { userId: DEMO_PLAYER, name: 'Imogen Marsh', roles: ['player'] },
      { userId: 'demo-p2', name: 'Dan Vey', roles: ['player'] },
      { userId: 'demo-p3', name: 'Cass Arden', roles: ['player'] },
      { userId: 'demo-p4', name: 'Lou Bramwell', roles: ['player'] },
    ];
    this.presence = Object.fromEntries(
      this.members
        .filter((m) => m.userId !== 'demo-p4')
        .map((m) => [presenceId(DEMO_ID, m.userId), row(presenceId(DEMO_ID, m.userId), { lastSeen: new Date(T0).toISOString() })]),
    );
    const keepFresh = () => {
      for (const p of Object.values(this.presence)) p.lastSeen = new Date().toISOString();
    };
    setInterval(keepFresh, 20_000);

    this.profiles = {
      'demo-isolde': row('demo-isolde', { name: 'Isolde Marchetti', nature: 'Visionary', demeanor: 'Bon Vivant', concept: 'Fallen violinist' }),
      'demo-dmitri': row('demo-dmitri', { name: 'Dmitri Voss' }),
      'demo-ceren': row('demo-ceren', { name: 'Ceren Aydın' }),
      'demo-luther': row('demo-luther', { name: 'Luther Bask' }),
      'demo-anselm': row('demo-anselm', { name: 'Brother Anselm', concept: 'Lasombra confessor' }),
    };

    const w = this.world;
    w.characters = {
      'demo-isolde': character('demo-isolde', DEMO_PLAYER, {
        clan: 'Toreador',
        sire: '',
        generation: 10,
        attributes: { strength: 2, dexterity: 3, stamina: 3, charisma: 3, manipulation: 4, appearance: 4, perception: 3, intelligence: 2, wits: 3 },
        abilities: { alertness: 2, empathy: 3, subterfuge: 4, streetwise: 1, etiquette: 3, firearms: 2, performance: 4, stealth: 2, academics: 2, investigation: 1, occult: 2, politics: 3 },
        specialties: [
          { trait: 'subterfuge', text: 'Seduction' },
          { trait: 'performance', text: 'Violin' },
        ],
        disciplines: [
          { name: 'Auspex', level: 2 },
          { name: 'Celerity', level: 1 },
          { name: 'Presence', level: 3 },
        ],
        virtues: { conscience: 3, selfControl: 3, courage: 2 },
        pathRating: 6,
        willpowerTemporary: 3,
        bloodPool: 8,
        healthLethal: 1,
        healthBashing: 1,
        difficultySealed: true,
      }),
      'demo-dmitri': character('demo-dmitri', 'demo-p2', {
        clan: 'Brujah',
        generation: 11,
        attributes: { strength: 4, dexterity: 3, wits: 2 },
        abilities: { brawl: 4 },
        pathRating: 5,
        willpowerPermanent: 6,
        willpowerTemporary: 5,
        bloodPool: 4,
        bloodSpentThisTurn: 1,
        bloodSpentTurnRef: 3,
        healthLethal: 2,
        healthBashing: 1,
      }),
      'demo-ceren': character('demo-ceren', 'demo-p3', {
        clan: 'Tremere',
        generation: 9,
        attributes: { wits: 3, intelligence: 4 },
        abilities: { occult: 4 },
        willpowerPermanent: 7,
        willpowerTemporary: 7,
        bloodPool: 12,
      }),
      // The Storyteller's own DMPC.
      'demo-anselm': character('demo-anselm', DEMO_ST, {
        clan: 'Lasombra',
        generation: 9,
        attributes: { manipulation: 4, wits: 3 },
        abilities: { subterfuge: 3, occult: 3 },
        willpowerPermanent: 6,
        willpowerTemporary: 6,
        bloodPool: 10,
      }),
      'demo-luther': character('demo-luther', 'demo-p4', {
        clan: 'Nosferatu',
        generation: 12,
        attributes: { perception: 3 },
        abilities: { alertness: 2 },
        pathRating: 4,
        willpowerPermanent: 4,
        willpowerTemporary: 2,
        bloodPool: 1,
        bloodSpentThisTurn: 1,
        bloodSpentTurnRef: 3,
        healthBashing: 1,
      }),
    };
    w.sealed = { 'demo-isolde': 7 };

    const seedRoll = (id: string, min: number, data: Record<string, any>, difficulty: number, revealed = false) => {
      w.rolls.push(row(id, { chronicleId: DEMO_ID, kind: 'pool', visibility: 'table', ...data, ...(revealed ? { revealedDifficulty: difficulty } : {}) }, min));
      w.rollSecrets[id] = row(id, { chronicleId: DEMO_ID, rollId: id, difficulty, revealed }, min);
    };
    seedRoll('demo-r4', 0.5, {
      characterId: 'demo-luther', characterName: 'Luther Bask', label: 'Perception + Alertness',
      dice: JSON.stringify([{ value: 4 }, { value: 6 }, { value: 2 }, { value: 7 }]),
      rawSuccesses: 0, ones: 0, netSuccesses: 0, outcome: 'failure', visibility: 'storyteller',
    }, 8);
    seedRoll('demo-r3', 2, {
      characterId: 'demo-ceren', characterName: 'Ceren Aydın', label: 'Wits + Occult',
      dice: JSON.stringify([{ value: 1 }, { value: 1 }, { value: 4 }, { value: 7 }]),
      rawSuccesses: 1, ones: 2, netSuccesses: -1, outcome: 'botch',
    }, 6);
    seedRoll('demo-r2', 5, {
      characterId: 'demo-dmitri', characterName: 'Dmitri Voss', label: 'Strength + Brawl',
      dice: JSON.stringify([{ value: 9 }, { value: 7 }, { value: 2 }, { value: 6 }, { value: 10 }, { value: 4 }]),
      rawSuccesses: 4, ones: 0, netSuccesses: 4, outcome: 'success',
    }, 6, true);
    seedRoll('demo-r1', 8, {
      characterId: 'demo-isolde', characterName: 'Isolde Marchetti', label: 'Dexterity + Firearms', woundPenalty: 1,
      dice: JSON.stringify([{ value: 8 }, { value: 10 }, { value: 3 }, { value: 1 }]),
      rawSuccesses: 2, ones: 1, netSuccesses: 1, outcome: 'success',
    }, 7);
    w.rolls.sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));

    w.secrets = {
      'demo-s1': row('demo-s1', { chronicleId: DEMO_ID, body: 'The gallery owner is Ceren’s childe, Embraced without leave of the Prince.', visibleTo: ['demo-p3'], subjectCharacterId: 'demo-ceren' }, 30),
      'demo-s2': row('demo-s2', { chronicleId: DEMO_ID, body: 'Someone in Elysium has been feeding on Isolde’s herd.', visibleTo: ['demo-p4'], subjectCharacterId: 'demo-isolde' }, 20),
    };
    w.seals = {
      'demo-s1': row('demo-s1', { chronicleId: DEMO_ID, subjectCharacterId: 'demo-ceren', knownCount: 0, ownerId: 'demo-p3' }, 30),
      'demo-s2': row('demo-s2', { chronicleId: DEMO_ID, subjectCharacterId: 'demo-isolde', knownCount: 1, ownerId: DEMO_PLAYER }, 20),
    };
    // The Storyteller's own write-ups, as a table would enter them.
    const entry = (id: string, data: Record<string, any>) => (w.library[id] = row(id, { chronicleId: DEMO_ID, page: '', ...data }, 90));
    entry('demo-l1', { kind: 'merit', name: 'Eat Food', points: 1, summary: 'Can eat and taste food. It gives no nourishment and comes back up before dawn.' });
    entry('demo-l2', { kind: 'flaw', name: 'Nightmares', points: 1, summary: 'Troubled day-sleep. At our table: roll Willpower on waking or start the night one die down.' });
    entry('demo-l4', { kind: 'path', name: 'Path of Night', summary: 'Conviction and Instinct. Vampires as agents of damnation: tempt, horrify, leave no one untouched.' });
    entry('demo-l5', { kind: 'trait', name: 'Firearms', summary: "Using and caring for guns.\n• Novice: Had an air rifle as a kid.\n•• Practiced: Regular at the range.\n••• Competent: Has come through real gunfights.\n•••• Expert: Could shoot for a living.\n••••• Master: Decades of practice, maybe centuries." });
    entry('demo-l6', { kind: 'trait', name: 'Subterfuge', summary: "Lying well and seeing through others' lies.\n• Novice: White lies, now and then.\n•• Practiced: About what every vampire picks up.\n••• Competent: Courtroom-lawyer smooth.\n•••• Expert: Deep-cover operative.\n••••• Master: The last person anyone would suspect." });
    entry('demo-l7', { kind: 'archetype', name: 'Visionary', summary: "Sees past the mundane to what could be, and pushes society to get there. Willpower: regain it for persuading others to believe in your vision and act on it." });
    entry('demo-l8', { kind: 'archetype', name: 'Bon Vivant', summary: "Unlife is meaningless, so enjoy it. Not reckless, just set on a good time. Willpower: regain it for truly enjoying yourself and letting it show." });
    entry('demo-l3', { kind: 'rule', name: 'Feeding scenes', summary: 'Hunting happens off-screen unless someone asks to play it out.' });
    this.project();
  }

  /** The row permissions, applied by hand. */
  private project() {
    const st = this.me === DEMO_ST;
    const w = this.world;
    this.characters = Object.fromEntries(Object.entries(w.characters).filter(([, c]) => st || c.ownerId === this.me));
    this.rolls = w.rolls.filter((r) => st || r.visibility === 'table');
    this.rollSecrets = Object.fromEntries(Object.entries(w.rollSecrets).filter(([, s]) => st || s.revealed));
    this.secrets = Object.fromEntries(Object.entries(w.secrets).filter(([, s]) => st || s.visibleTo.includes(this.me)));
    this.seals = Object.fromEntries(Object.entries(w.seals).filter(([, s]) => st || s.ownerId === this.me));
    this.proposals = Object.fromEntries(Object.entries(w.proposals).filter(([, p]) => st || p.ownerId === this.me));
    this.library = { ...w.library };
  }

  /** The adjust and approve paths: traits set, derived limits kept true. */
  private applySheet(c: Character, patch: Partial<Character>) {
    const next: Partial<Character> = { ...patch };
    if (patch.generation) {
      next.bloodPoolMax = bloodPoolMax(patch.generation);
      next.bloodPerTurn = bloodPerTurn(patch.generation);
      if (c.bloodPool > next.bloodPoolMax) next.bloodPool = next.bloodPoolMax;
    }
    const wp = patch.willpowerPermanent ?? c.willpowerPermanent;
    if (c.willpowerTemporary > wp) next.willpowerTemporary = wp;
    this.commit(c, next);
  }

  private commit(c: Character, patch: Partial<Character>) {
    this.world.characters[c.$id] = { ...c, ...patch, version: c.version + 1 };
    this.project();
  }

  override async damage(characterId: string, amount: number, type: DamageType) {
    const c = this.world.characters[characterId];
    const out = applyDamage(healthOf(c), amount, type);
    this.commit(c, { healthBashing: out.track.bashing, healthLethal: out.track.lethal, healthAggravated: out.track.aggravated });
  }

  override async spend(characterId: string, amount: number) {
    const c = this.world.characters[characterId];
    const out = spendBlood(stateOf(c), amount, this.turnRef);
    if (!out.ok) {
      this.flashing[`${characterId}:blood`] = Date.now();
      this.error = out.message;
      throw new Refusal(out.message);
    }
    this.commit(c, { bloodPool: out.bloodPool, bloodSpentThisTurn: out.bloodSpentThisTurn, bloodSpentTurnRef: out.bloodSpentTurnRef });
  }

  override async act<T = any>(fn: string, body: Record<string, any>): Promise<T | null> {
    this.error = null;
    try {
      return (await this.run(fn, body)) as T;
    } catch (e) {
      this.error = e instanceof Refusal ? e.message : 'That isn’t part of the demo.';
      return null;
    }
  }

  private roll(c: Character, spec: { label: string; basePool: number; specialty?: boolean; willpower?: boolean; kind?: string; note?: string; difficulty?: number; visibility?: 'table' | 'storyteller' }) {
    let difficulty = spec.difficulty ?? this.world.sealed[c.$id] ?? 6;
    if (spec.difficulty === undefined && this.world.sealed[c.$id] !== undefined) {
      delete this.world.sealed[c.$id];
    }
    if (spec.willpower) {
      const can = canSpendWillpower(c.willpowerTemporary, c.willpowerSpentTurnRef, this.turnRef);
      if (!can.ok) throw new Refusal(can.message);
    }
    const r = rollPool(
      { basePool: spec.basePool, difficulty, specialtyApplies: spec.specialty, spendWillpower: spec.willpower, label: spec.label, botchRule: this.chronicle!.botchRule },
      { character: { health: healthOf(c), willpowerTemporary: c.willpowerTemporary }, die: cryptoDie },
    );
    const id = `demo-${Math.random().toString(36).slice(2, 10)}`;
    const visibility = spec.visibility ?? 'table';
    const rollRow = row(id, {
      chronicleId: DEMO_ID, characterId: c.$id, characterName: this.nameOf(c.$id), kind: spec.kind ?? 'pool', label: r.label,
      basePool: r.basePool, woundPenalty: r.woundPenalty, pool: r.pool, dice: JSON.stringify(r.dice), rawSuccesses: r.rawSuccesses,
      ones: r.ones, netSuccesses: r.netSuccesses, willpowerSpent: r.willpowerSpent, outcome: r.outcome, visibility, refusal: r.refusal ?? null, note: spec.note ?? null,
    }, 0);
    rollRow.$createdAt = new Date().toISOString();
    this.world.rolls.unshift(rollRow);
    this.world.rollSecrets[id] = row(id, { chronicleId: DEMO_ID, rollId: id, difficulty, revealed: false }, 0);
    this.fresh[id] = true;
    const patch: Partial<Character> = { difficultySealed: this.world.sealed[c.$id] !== undefined };
    if (r.willpowerSpent) Object.assign(patch, { willpowerTemporary: c.willpowerTemporary - 1, willpowerSpentTurnRef: this.turnRef });
    return { r, patch };
  }

  private run(fn: string, b: Record<string, any>): unknown {
    const w = this.world;
    const c = b.characterId ? w.characters[b.characterId] : null;
    switch (fn) {
      case 'rollPool': {
        if (!c) break;
        if (b.basePool !== undefined) {
          const { patch } = this.roll(c, { label: b.label, basePool: b.basePool, difficulty: b.difficulty, visibility: b.visibility });
          this.commit(c, patch);
          return {};
        }
        const built = buildPool(sheetOf(c), b.traits, b.specialty);
        if (!built.ok) throw new Refusal(built.message);
        const { r, patch } = this.roll(c, { label: built.pool.label, basePool: built.pool.basePool, specialty: built.pool.specialtyApplies, willpower: b.spendWillpower });
        this.commit(c, patch);
        return r;
      }
      case 'virtueCheck': {
        if (!c) break;
        const virtue = virtueForCheck(c.virtues, b.kind);
        const name = b.kind === 'degeneration' ? 'Degeneration' : b.kind === 'frenzy' ? 'Frenzy' : 'Rötschreck';
        const { r, patch } = this.roll(c, {
          label: `${name} · ${traitLabel(virtue)}`, basePool: traitDots(sheetOf(c), virtue), kind: b.kind, note: b.sin ?? b.provocation, difficulty: b.difficulty,
        });
        if (b.kind === 'degeneration' && r.outcome !== 'success') {
          patch.pathRating = Math.max(0, c.pathRating - 1);
          w.rolls[0].note = `${b.sin} — ${c.path} falls to ${patch.pathRating}`;
        }
        this.commit(c, patch);
        return r;
      }
      case 'sealDifficulty':
        if (!c) break;
        if (b.clear) delete w.sealed[c.$id];
        else w.sealed[c.$id] = b.difficulty;
        this.commit(c, { difficultySealed: !b.clear });
        return {};
      case 'revealRoll': {
        const s = w.rollSecrets[b.rollId];
        s.revealed = true;
        const r = w.rolls.find((x) => x.$id === b.rollId)!;
        Object.assign(r, { revealedDifficulty: s.difficulty, visibility: 'table' });
        this.project();
        return {};
      }
      case 'feedAndHeal': {
        if (!c) break;
        let pool = feed(stateOf(c), b.bloodGained ?? 0).bloodPool;
        let track = healthOf(c);
        const patch: Partial<Character> = {};
        if (b.heal) {
          const budget = Math.min(pool, remainingThisTurn({ ...stateOf(c), bloodPool: pool }, this.turnRef));
          if (budget <= 0) throw new Refusal('No blood left to draw this turn. Healing waits for the Storyteller to advance the turn.');
          let spent = 0;
          for (const type of ['lethal', 'bashing'] as const) {
            const out = healDamage(track, 1 - spent, type, budget - spent);
            track = out.track;
            spent += out.bloodSpent;
          }
          pool -= spent;
          Object.assign(patch, { bloodSpentThisTurn: c.bloodPerTurn - remainingThisTurn(stateOf(c), this.turnRef) + spent, bloodSpentTurnRef: this.turnRef });
        }
        if (b.healAggravated) {
          const out = healDamage(track, 1, 'aggravated', pool);
          track = out.track;
          pool -= out.bloodSpent;
        }
        this.commit(c, { ...patch, bloodPool: pool, healthBashing: track.bashing, healthLethal: track.lethal, healthAggravated: track.aggravated });
        return {};
      }
      case 'scene':
        if (b.action === 'advance' && this.scene) {
          this.scene = { ...this.scene, turn: this.scene.turn + 1, initiative: '[]' };
          return {};
        }
        if (b.action === 'rollInitiative' && this.scene) {
          const entries = Object.values(w.characters).map((x) => ({
            label: this.nameOf(x.$id).split(' ')[0], characterId: x.$id, value: (x.attributes.dexterity ?? 1) + (x.attributes.wits ?? 1) + cryptoDie(),
          }));
          const all = [...entries, ...(b.entries ?? [])].sort((a, z) => z.value - a.value);
          this.scene = { ...this.scene, initiative: JSON.stringify(all) };
          return {};
        }
        break;
      case 'chronicle': {
        if (b.action !== 'saveEntry' && b.action !== 'removeEntry') break;
        if (this.me !== DEMO_ST) throw new Refusal('Only the Storyteller can do that.');
        if (b.action === 'removeEntry') {
          delete w.library[b.entryId];
        } else {
          const id = b.entryId ?? `demo-l${Date.now()}`;
          const clash = Object.values(w.library).some(
            (e) => e.$id !== id && e.kind === b.kind && String(e.name).toLowerCase() === String(b.name).trim().toLowerCase(),
          );
          if (clash) throw new Refusal(`There's already a ${b.kind} called ${b.name}.`);
          w.library[id] = row(id, {
            chronicleId: DEMO_ID, kind: b.kind, name: String(b.name).trim(),
            points: b.kind === 'merit' || b.kind === 'flaw' ? b.points : null, summary: b.summary ?? '', page: b.page ?? '',
          }, 0);
        }
        this.project();
        return {};
      }
      case 'character': {
        const c = w.characters[b.characterId];
        if (!c) break;
        const st = this.me === DEMO_ST;
        const p = w.proposals[c.$id];
        const drop = () => {
          delete w.proposals[c.$id];
          this.project();
        };
        if (b.action === 'propose' || b.action === 'withdraw') {
          if (c.ownerId !== this.me) throw new Refusal('Only a character’s player proposes changes to it.');
          if (b.action === 'withdraw' || Object.keys(b.sheet ?? {}).length === 0) return drop() ?? {};
          w.proposals[c.$id] = row(c.$id, {
            chronicleId: DEMO_ID, ownerId: c.ownerId, sheet: JSON.stringify(b.sheet),
            revision: (p?.revision ?? 0) + 1, status: 'pending', note: '',
          }, 0);
          this.project();
          return { revision: w.proposals[c.$id].revision };
        }
        if (b.action === 'delete') {
          if (!st && c.ownerId !== this.me) throw new Refusal('Only its player or the Storyteller can delete a character.');
          const name = String(this.profiles[c.$id]?.name ?? '');
          if (String(b.name ?? '').trim().toLowerCase() !== name.toLowerCase()) throw new Refusal(`To delete this character, send its name: ${name}.`);
          delete w.characters[c.$id];
          delete w.proposals[c.$id];
          delete w.sealed[c.$id];
          for (const [id, s] of Object.entries(w.seals)) if (s.subjectCharacterId === c.$id) delete w.seals[id];
          this.project();
          return { deleted: true };
        }
        if (!st) throw new Refusal('Only the Storyteller can do that.');
        if (b.action === 'adjust') {
          this.applySheet(c, b.sheet);
          return {};
        }
        if (!p) throw new Refusal('Proposal not found.');
        if (b.action === 'approve') {
          if (p.revision !== b.revision) throw new Refusal('The player changed this proposal while you were reading it. Look again.');
          this.applySheet(c, parseJson(p.sheet, {}));
          return drop() ?? {};
        }
        if (b.action === 'reject') {
          w.proposals[c.$id] = { ...p, status: 'declined', note: b.note ?? '' };
          this.project();
          return {};
        }
        break;
      }
      case 'revealSecret': {
        const s = w.secrets[b.secretId];
        s.visibleTo = [...s.visibleTo, b.userId];
        const seal = w.seals[b.secretId];
        if (seal) seal.knownCount = s.visibleTo.filter((id: string) => id !== seal.ownerId).length;
        this.project();
        return {};
      }
      case 'createSecret': {
        const id = `demo-s${Object.keys(w.secrets).length + 1}`;
        w.secrets[id] = row(id, { chronicleId: DEMO_ID, body: b.body, visibleTo: [], subjectCharacterId: b.subjectCharacterId ?? null }, 0);
        if (b.subjectCharacterId) {
          w.seals[id] = row(id, { chronicleId: DEMO_ID, subjectCharacterId: b.subjectCharacterId, knownCount: 0, ownerId: w.characters[b.subjectCharacterId].ownerId }, 0);
        }
        this.project();
        return {};
      }
    }
    throw new Error('unsupported');
  }
}
