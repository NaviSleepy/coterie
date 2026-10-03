/**
 * One chronicle, live. Holds everything the current user is permitted to read,
 * keeps it current over the websocket, and owns the three hard problems:
 *
 *   Optimistic updates  A health box or a blood spend renders instantly as a
 *                       pending delta folded over server state. The server
 *                       stays the truth: the delta drops once a row at or past
 *                       the version the Function reported arrives, and if the
 *                       Function refuses, it drops at once and the field
 *                       flashes to show it was corrected.
 *
 *   Conflicts           Deltas, never absolutes — the Functions compose them
 *                       through the ledger (functions/src/shared/mutate.ts).
 *
 *   Reconnect/resync    When the socket reopens after a drop, the snapshot is
 *                       refetched and replaced wholesale, and every roll made
 *                       while away is replayed into the feed, so a player gets
 *                       the story of what they missed rather than a silent
 *                       jump in the numbers.
 */

import { ID, Permission, Role } from 'appwrite';
import type { RealtimeResponseEvent, RealtimeSubscription } from 'appwrite';

import {
  applyDamage,
  bloodRules,
  remainingThisTurn,
  spendBlood,
  turnRef,
  type DamageType,
} from '$engine/index.ts';
import type { TableId } from '$schema';
import { decodeCharacter, healthOf, parseJson, stateOf, type Character } from '$shared/codec.ts';
import {
  call,
  CallError,
  channel,
  getRow,
  listAll,
  listRows,
  noteId,
  presenceId,
  Query,
  realtime,
  tables,
  teams,
  type AnyRow,
} from './appwrite';
import { DATABASE_ID } from '$schema';

export interface Member {
  userId: string;
  name: string;
  roles: string[];
}

type Pending =
  | { id: string; characterId: string; kind: 'damage'; amount: number; type: DamageType; until?: number }
  | { id: string; characterId: string; kind: 'blood'; amount: number; until?: number };

/** Longest notepad the app saves, in characters. */
export const NOTE_MAX = 20000;

const WATCHED: TableId[] = [
  'chronicles',
  'scenes',
  'characters',
  'profiles',
  'rolls',
  'rollSecrets',
  'secrets',
  'seals',
  'presence',
  'proposals',
  'creationRequests',
  'library',
  'npcs',
  'reckonings',
  'reckoningSeals',
  'coterieNotes',
];

const HEARTBEAT_MS = 30_000;
const PRESENT_WITHIN_MS = 90_000;

export class TableState {
  readonly chronicleId: string;
  /** Where this table's pages live: the demo overrides it. */
  /** Where the blank character sheet comes from; unset means the sheet-templates bucket. */
  sheetTemplate?: () => Promise<ArrayBuffer>;

  get home(): string {
    return `/c/${this.chronicleId}`;
  }
  me = $state('');
  myName = $state('');

  chronicle = $state<AnyRow | null>(null);
  scene = $state<AnyRow | null>(null);
  characters = $state<Record<string, Character>>({});
  profiles = $state<Record<string, AnyRow>>({});
  rolls = $state<AnyRow[]>([]);
  rollSecrets = $state<Record<string, AnyRow>>({});
  secrets = $state<Record<string, AnyRow>>({});
  seals = $state<Record<string, AnyRow>>({});
  presence = $state<Record<string, AnyRow>>({});
  /** Keyed by character id. The owner sees their own; the Storyteller sees all. */
  proposals = $state<Record<string, AnyRow>>({});
  /** New characters over the creation budget, waiting for the Storyteller. The player sees their own. */
  creationRequests = $state<Record<string, AnyRow>>({});
  /** Sins laid before characters, keyed by character id; the seals (difficulties) only reach the Storyteller. */
  reckonings = $state<Record<string, AnyRow>>({});
  reckoningSeals = $state<Record<string, AnyRow>>({});
  /** The coterie's shared notes, once someone has opened them. */
  coterieNote = $state<AnyRow | null>(null);
  /** The Storyteller's reference entries, readable by the whole table. */
  library = $state<Record<string, AnyRow>>({});
  /** The Storyteller's NPCs. Players' reads come back empty: the rows are behind the screen. */
  npcs = $state<Record<string, AnyRow>>({});
  members = $state<Member[]>([]);

  pending = $state<Pending[]>([]);
  flashing = $state<Record<string, number>>({});
  /** Roll ids replayed after a reconnect — the feed marks them. */
  replayed = $state<Record<string, true>>({});
  /** Roll ids that arrived live and should animate in. */
  fresh = $state<Record<string, true>>({});
  status = $state<'connecting' | 'live' | 'reconnecting'>('connecting');
  error = $state<string | null>(null);
  now = $state(Date.now());

  protected subscription: RealtimeSubscription | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private lastEventAt = new Date().toISOString();
  private wasOpen = false;
  private closed = false;

  constructor(chronicleId: string, me: string, myName: string) {
    this.chronicleId = chronicleId;
    this.me = me;
    this.myName = myName;
  }

  // ── derived views ───────────────────────────────────────────────────────

  get isStoryteller(): boolean {
    return this.chronicle?.storytellerId === this.me;
  }

  get turnRef(): number {
    return turnRef(this.scene ? { turnBase: this.scene.turnBase ?? 0, turn: this.scene.turn ?? 0 } : null);
  }

  get mine(): Character[] {
    return Object.values(this.characters).filter((c) => c.ownerId === this.me);
  }

  /** A character the Storyteller plays themselves. */
  isDmpc(c: Character): boolean {
    return !!this.chronicle && c.ownerId === this.chronicle.storytellerId;
  }

  get coterie(): Character[] {
    return Object.values(this.characters).sort((a, b) => this.nameOf(a.$id).localeCompare(this.nameOf(b.$id)));
  }

  get initiative(): { label: string; characterId?: string; value: number }[] {
    return parseJson(this.scene?.initiative, []);
  }

  get atTable(): Member[] {
    return this.members.filter((m) => {
      const p = this.presence[presenceId(this.chronicleId, m.userId)];
      return p && this.now - Date.parse(p.lastSeen) < PRESENT_WITHIN_MS;
    });
  }

  nameOf(characterId: string): string {
    return (this.profiles[characterId]?.name as string) ?? 'Unnamed';
  }

  /** Server state with this client's in-flight deltas folded on top. */
  view(characterId: string): Character | null {
    const base = this.characters[characterId];
    if (!base) return null;
    let c = base;
    for (const p of this.pending) {
      if (p.characterId !== characterId) continue;
      if (p.kind === 'damage') {
        const out = applyDamage(healthOf(c), p.amount, p.type);
        c = { ...c, healthBashing: out.track.bashing, healthLethal: out.track.lethal, healthAggravated: out.track.aggravated };
      } else {
        const out = spendBlood(stateOf(c), p.amount, this.turnRef, bloodRules(c));
        if (out.ok) c = { ...c, bloodPool: out.bloodPool, bloodSpentThisTurn: out.bloodSpentThisTurn, bloodSpentTurnRef: out.bloodSpentTurnRef };
      }
    }
    return c;
  }

  remainingThisTurn(c: Character): number {
    return remainingThisTurn(stateOf(c), this.turnRef);
  }

  isFlashing(key: string): boolean {
    return (this.flashing[key] ?? 0) > this.now - 900;
  }

  // ── lifecycle ───────────────────────────────────────────────────────────

  async open() {
    this.closed = false;
    await this.snapshot();
    await this.subscribe();
    await this.beat();
    this.heartbeat = setInterval(() => void this.beat(), HEARTBEAT_MS);
    this.clock = setInterval(() => (this.now = Date.now()), 1000);
  }

  async close() {
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.clock) clearInterval(this.clock);
    await this.subscription?.unsubscribe().catch(() => {});
    this.subscription = null;
  }

  /** Everything this user may read, replaced wholesale. */
  async snapshot() {
    const chronicle = await getRow('chronicles', this.chronicleId);
    if (!chronicle) throw new Error('This chronicle does not exist, or you are not at its table.');
    const by = [Query.equal('chronicleId', this.chronicleId), Query.limit(100)];

    const coterieNote = getRow('coterieNotes', this.chronicleId).catch(() => null);
    const [scene, characters, profiles, rolls, rollSecrets, secrets, seals, presence, proposals, creationRequests, library, npcs, reckonings, reckoningSeals, memberships] = await Promise.all([
      chronicle.currentSceneId ? getRow('scenes', chronicle.currentSceneId) : Promise.resolve(null),
      listRows('characters', by),
      listRows('profiles', by),
      listRows('rolls', [Query.equal('chronicleId', this.chronicleId), Query.orderDesc('$createdAt'), Query.limit(40)]),
      listRows('rollSecrets', [Query.equal('chronicleId', this.chronicleId), Query.orderDesc('$createdAt'), Query.limit(40)]),
      listRows('secrets', by),
      listRows('seals', by),
      listRows('presence', by),
      listRows('proposals', by),
      listRows('creationRequests', by),
      listAll('library', [Query.equal('chronicleId', this.chronicleId)]),
      listRows('npcs', by),
      listRows('reckonings', by),
      listRows('reckoningSeals', by),
      teams.listMemberships({ teamId: chronicle.teamId }),
    ]);

    this.chronicle = chronicle;
    this.scene = scene;
    this.characters = Object.fromEntries(characters.map((r) => [r.$id, decodeCharacter(r as any)]));
    this.profiles = byId(profiles);
    this.rolls = rolls;
    this.rollSecrets = byId(rollSecrets);
    this.secrets = byId(secrets);
    this.seals = byId(seals);
    this.presence = byId(presence);
    this.proposals = byId(proposals);
    this.creationRequests = byId(creationRequests);
    this.library = byId(library);
    this.npcs = byId(npcs);
    this.reckonings = byId(reckonings);
    this.reckoningSeals = byId(reckoningSeals);
    this.coterieNote = await coterieNote;
    this.members = memberships.memberships.map((m) => ({ userId: m.userId, name: m.userName || 'Someone', roles: m.roles }));
    this.settlePending();
  }

  private async subscribe() {
    realtime.onOpen(() => {
      if (this.closed) return;
      if (this.wasOpen && this.status === 'reconnecting') void this.resync();
      this.wasOpen = true;
      this.status = 'live';
    });
    realtime.onClose(() => {
      if (!this.closed) this.status = 'reconnecting';
    });
    this.subscription = await realtime.subscribe(
      WATCHED.map(channel),
      (event: RealtimeResponseEvent<AnyRow>) => this.onEvent(event),
    );
    this.status = 'live';
    this.wasOpen = true;
  }

  /**
   * Step 1–2: refetch and replace. Step 3: replay the rolls made while the
   * socket was down into the feed, marked so the UI can tell the story.
   */
  private async resync() {
    const since = this.lastEventAt;
    const known = new Set(this.rolls.map((r) => r.$id));
    await this.snapshot();
    const missed = await listRows('rolls', [
      Query.equal('chronicleId', this.chronicleId),
      Query.greaterThan('$createdAt', since),
      Query.orderAsc('$createdAt'),
      Query.limit(100),
    ]);
    for (const r of missed) if (!known.has(r.$id)) this.replayed[r.$id] = true;
    this.lastEventAt = new Date().toISOString();
  }

  private onEvent(event: RealtimeResponseEvent<AnyRow>) {
    const row = event.payload;
    const table = event.channels
      .map((c) => c.match(/\.tables\.([^.]+)\.rows/)?.[1])
      .find(Boolean) as TableId | undefined;
    if (!table) return;
    const inChronicle = table === 'chronicles' ? row.$id === this.chronicleId : row.chronicleId === this.chronicleId;
    if (!inChronicle) return;

    this.lastEventAt = new Date().toISOString();
    const deleted = event.events.some((e) => e.endsWith('.delete'));

    switch (table) {
      case 'chronicles':
        this.chronicle = row;
        if (row.currentSceneId !== this.scene?.$id) {
          void (row.currentSceneId ? getRow('scenes', row.currentSceneId) : Promise.resolve(null)).then(
            (s) => (this.scene = s),
          );
        }
        break;
      case 'scenes':
        if (row.$id === this.chronicle?.currentSceneId) this.scene = row;
        break;
      case 'characters':
        if (deleted) delete this.characters[row.$id];
        else this.characters[row.$id] = decodeCharacter(row as any);
        this.settlePending();
        break;
      case 'rolls': {
        const i = this.rolls.findIndex((r) => r.$id === row.$id);
        if (i >= 0) this.rolls[i] = row;
        else {
          this.rolls = [row, ...this.rolls].slice(0, 80);
          this.fresh[row.$id] = true;
        }
        break;
      }
      case 'coterieNotes':
        if (!deleted) this.coterieNote = row;
        break;
      case 'rollSecrets':
      case 'secrets':
      case 'seals':
      case 'presence':
      case 'proposals':
      case 'creationRequests':
      case 'library':
      case 'npcs':
      case 'reckonings':
      case 'reckoningSeals':
      case 'profiles': {
        const map = this[table === 'rollSecrets' ? 'rollSecrets' : table] as Record<string, AnyRow>;
        if (deleted) delete map[row.$id];
        else map[row.$id] = row;
        break;
      }
    }
  }

  private async beat() {
    const id = presenceId(this.chronicleId, this.me);
    const data = { chronicleId: this.chronicleId, userId: this.me, displayName: this.myName, lastSeen: new Date().toISOString() };
    try {
      if (this.presence[id]) {
        await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'presence', rowId: id, data });
      } else {
        const teamId = this.chronicle!.teamId as string;
        await tables.createRow({
          databaseId: DATABASE_ID,
          tableId: 'presence',
          rowId: id,
          data,
          permissions: [Permission.read(Role.team(teamId)), Permission.update(Role.user(this.me)), Permission.delete(Role.user(this.me))],
        });
      }
    } catch (e) {
      // A row made in another tab: fall back to updating it.
      if ((e as { code?: number }).code === 409) {
        await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'presence', rowId: id, data }).catch(() => {});
      }
    }
  }

  // ── optimistic mutations ────────────────────────────────────────────────

  private settlePending() {
    this.pending = this.pending.filter((p) => {
      if (p.until === undefined) return true;
      const c = this.characters[p.characterId];
      return !c || c.version < p.until;
    });
  }

  private async optimistic(p: Pending, flashKey: string, run: () => Promise<{ version: number }>) {
    this.pending = [...this.pending, p];
    this.error = null;
    try {
      const out = await run();
      this.pending = this.pending.map((q) => (q.id === p.id ? { ...q, until: out.version } : q));
      this.settlePending();
    } catch (e) {
      this.pending = this.pending.filter((q) => q.id !== p.id);
      this.flashing[flashKey] = Date.now();
      this.error = e instanceof CallError ? e.message : 'The table did not answer. Try again.';
      throw e;
    }
  }

  damage(characterId: string, amount: number, type: DamageType) {
    return this.optimistic(
      { id: ID.unique(), characterId, kind: 'damage', amount, type },
      `${characterId}:health`,
      () => call('applyDamage', { characterId, amount, type }),
    );
  }

  spend(characterId: string, amount: number, reason = 'spent') {
    return this.optimistic(
      { id: ID.unique(), characterId, kind: 'blood', amount },
      `${characterId}:blood`,
      () => call('spendBlood', { characterId, amount, reason }),
    );
  }

  /** Non-optimistic calls: the answer is the point, so wait for it. */
  async act<T = any>(fn: Parameters<typeof call>[0], body: Record<string, unknown>): Promise<T | null> {
    this.error = null;
    try {
      return await call<T>(fn, body);
    } catch (e) {
      this.error = e instanceof CallError ? e.message : 'The table did not answer. Try again.';
      return null;
    }
  }

  /**
   * The cosmetic profile — name, concept, Nature, Demeanor, gear — is the one
   * row a player writes directly; the row's permissions are the check.
   */
  /** The caller's own notepad for this chronicle, or '' when they haven't written one. */
  async loadNote(): Promise<string> {
    const row = await getRow('notes', noteId(this.chronicleId, this.me));
    return (row?.body as string) ?? '';
  }

  /** Saves the notepad; the row is created on first save, readable and writable by its author alone. */
  async saveNote(body: string): Promise<boolean> {
    const rowId = noteId(this.chronicleId, this.me);
    const data = { chronicleId: this.chronicleId, userId: this.me, body: body.slice(0, NOTE_MAX) };
    try {
      try {
        await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'notes', rowId, data });
      } catch (e) {
        if ((e as { code?: number }).code !== 404) throw e;
        const me = Role.user(this.me);
        await tables.createRow({
          databaseId: DATABASE_ID,
          tableId: 'notes',
          rowId,
          data,
          permissions: [Permission.read(me), Permission.update(me), Permission.delete(me)],
        });
      }
      return true;
    } catch (e) {
      this.error = (e as Error).message;
      return false;
    }
  }

  /** Makes sure the shared notes row exists; only the chronicle Function can create it. */
  async openCoterieNotes(): Promise<void> {
    if (this.coterieNote) return;
    const row = await this.act<AnyRow>('chronicle', { action: 'openNotes', chronicleId: this.chronicleId });
    if (row) this.coterieNote = row;
  }

  /**
   * Saves the shared notes, unless someone else saved since `base` (the
   * $updatedAt the editor last loaded): then it hands back their version
   * instead, so nobody's words vanish without them knowing.
   */
  async saveCoterieNote(body: string, base: string): Promise<{ row: AnyRow } | { conflict: AnyRow } | null> {
    try {
      const current = await getRow('coterieNotes', this.chronicleId);
      if (current && current.$updatedAt !== base) return { conflict: current };
      const row = await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: 'coterieNotes',
        rowId: this.chronicleId,
        data: { body: body.slice(0, NOTE_MAX), editedBy: this.myName.slice(0, 120) },
      });
      this.coterieNote = row as unknown as AnyRow;
      return { row: this.coterieNote };
    } catch (e) {
      this.error = (e as Error).message;
      return null;
    }
  }

  async saveProfile(characterId: string, data: Record<string, unknown>): Promise<boolean> {
    this.error = null;
    try {
      await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'profiles', rowId: characterId, data });
      return true;
    } catch (e) {
      this.error = (e as Error).message;
      return false;
    }
  }
}

function byId(rows: AnyRow[]): Record<string, AnyRow> {
  return Object.fromEntries(rows.map((r) => [r.$id, r]));
}
