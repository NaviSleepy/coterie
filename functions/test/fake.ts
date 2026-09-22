/**
 * An in-memory TablesDB + Teams that honours the parts of the contract the
 * Functions depend on:
 *
 *   - getRow on a missing id throws { code: 404 }
 *   - createRow on an existing id throws { code: 409 }, inside a transaction
 *     at commit time, and a failed commit applies nothing
 *   - listRows understands the equal / limit queries node-appwrite emits
 *
 * `beforeCommit` lets a test run a competing write in the window between a
 * Function reading state and committing — the race mutate.ts exists for.
 */

import { scriptedDice } from '../../engine/src/index.ts';
import { Store, type Row, type TablesLike, type TeamsLike } from '../src/shared/store.ts';
import type { Ctx } from '../src/shared/http.ts';

class AppwriteError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

type Op =
  | { kind: 'create'; table: string; rowId: string; data: Record<string, any>; permissions: string[] }
  | { kind: 'update'; table: string; rowId: string; data: Record<string, any>; permissions?: string[] }
  | { kind: 'delete'; table: string; rowId: string };

export class FakeTables implements TablesLike {
  data = new Map<string, Map<string, Row>>();
  private txs = new Map<string, Op[]>();
  private txSeq = 0;
  commits = 0;
  conflicts = 0;
  beforeCommit: (() => Promise<void> | void) | null = null;

  private table(id: string) {
    if (!this.data.has(id)) this.data.set(id, new Map());
    return this.data.get(id)!;
  }

  seed(tableId: string, rowId: string, data: Record<string, any>, permissions: string[] = []): Row {
    const now = new Date().toISOString();
    const row: Row = { ...data, $id: rowId, $createdAt: now, $updatedAt: now, $permissions: permissions };
    this.table(tableId).set(rowId, row);
    return row;
  }

  row(tableId: string, rowId: string): Row | undefined {
    const r = this.table(tableId).get(rowId);
    return r ? structuredClone(r) : undefined;
  }

  rows(tableId: string): Row[] {
    return [...this.table(tableId).values()].map((r) => structuredClone(r));
  }

  async getRow({ tableId, rowId }: any): Promise<Row> {
    const r = this.table(tableId).get(rowId);
    if (!r) throw new AppwriteError(404, `${tableId}/${rowId} not found`);
    return structuredClone(r);
  }

  async listRows({ tableId, queries = [] }: any) {
    let rows = [...this.table(tableId).values()];
    let limit = Infinity;
    for (const q of queries.map((s: string) => JSON.parse(s))) {
      if (q.method === 'equal') rows = rows.filter((r) => q.values.includes(r[q.attribute]));
      if (q.method === 'limit') limit = q.values[0];
    }
    rows = rows.slice(0, limit);
    return { total: rows.length, rows: rows.map((r) => structuredClone(r)) };
  }

  private apply(op: Op) {
    const t = this.table(op.table);
    const now = new Date().toISOString();
    if (op.kind === 'create') {
      if (t.has(op.rowId)) throw new AppwriteError(409, `${op.table}/${op.rowId} already exists`);
      t.set(op.rowId, { ...op.data, $id: op.rowId, $createdAt: now, $updatedAt: now, $permissions: op.permissions });
    } else if (op.kind === 'update') {
      const r = t.get(op.rowId);
      if (!r) throw new AppwriteError(404, `${op.table}/${op.rowId} not found`);
      t.set(op.rowId, { ...r, ...op.data, $updatedAt: now, $permissions: op.permissions ?? r.$permissions });
    } else {
      if (!t.delete(op.rowId)) throw new AppwriteError(404, `${op.table}/${op.rowId} not found`);
    }
    return structuredClone(t.get(op.rowId)!);
  }

  private stageOrApply(transactionId: string | undefined, op: Op): any {
    if (transactionId) {
      this.txs.get(transactionId)!.push(op);
      return { $id: op.rowId };
    }
    return this.apply(op);
  }

  async createRow({ tableId, rowId, data, permissions = [], transactionId }: any) {
    return this.stageOrApply(transactionId, { kind: 'create', table: tableId, rowId, data, permissions });
  }

  async updateRow({ tableId, rowId, data = {}, permissions, transactionId }: any) {
    return this.stageOrApply(transactionId, { kind: 'update', table: tableId, rowId, data, permissions });
  }

  async deleteRow({ tableId, rowId, transactionId }: any) {
    return this.stageOrApply(transactionId, { kind: 'delete', table: tableId, rowId });
  }

  async createTransaction() {
    const $id = `tx${++this.txSeq}`;
    this.txs.set($id, []);
    return { $id };
  }

  async updateTransaction({ transactionId, commit, rollback }: any) {
    const ops = this.txs.get(transactionId);
    if (!ops) throw new AppwriteError(404, 'transaction not found');
    this.txs.delete(transactionId);
    if (rollback || !commit) return {};

    const hook = this.beforeCommit;
    this.beforeCommit = null; // one-shot, so the competing write doesn't recurse
    if (hook) await hook();

    // All-or-nothing: apply against a snapshot, restore it on any failure.
    const snapshot = new Map([...this.data].map(([k, v]) => [k, new Map([...v].map(([id, r]) => [id, structuredClone(r)]))]));
    try {
      for (const op of ops) this.apply(op);
      this.commits++;
    } catch (e) {
      this.data = snapshot;
      if ((e as AppwriteError).code === 409) this.conflicts++;
      throw e;
    }
    return {};
  }
}

export class FakeTeams implements TeamsLike {
  teams = new Map<string, { name: string; members: { userId: string; roles: string[] }[] }>();

  async create({ teamId, name }: any) {
    this.teams.set(teamId, { name, members: [] });
    return { $id: teamId };
  }

  async createMembership({ teamId, roles, userId }: any) {
    const t = this.teams.get(teamId);
    if (!t) throw new AppwriteError(404, 'team not found');
    if (t.members.some((m) => m.userId === userId)) throw new AppwriteError(409, 'already a member');
    t.members.push({ userId, roles });
    return {};
  }

  async listMemberships({ teamId, queries = [] }: any) {
    const t = this.teams.get(teamId);
    if (!t) throw new AppwriteError(404, 'team not found');
    let members = t.members;
    for (const q of queries.map((s: string) => JSON.parse(s))) {
      if (q.method === 'equal' && q.attribute === 'userId') members = members.filter((m) => q.values.includes(m.userId));
    }
    return {
      total: members.length,
      memberships: members.map((m, i) => ({ $id: `m${i}`, userId: m.userId, userName: m.userId, roles: m.roles })),
    };
  }
}

export interface World {
  tables: FakeTables;
  teams: FakeTeams;
  as: (userId: string, dice?: number[]) => Ctx;
}

export function world(): World {
  const tables = new FakeTables();
  const teams = new FakeTeams();
  const store = new Store(tables, teams);
  return {
    tables,
    teams,
    as: (userId, dice = [7]) => ({
      store,
      userId,
      die: scriptedDice(dice),
      now: () => new Date('2026-09-22T21:00:00Z'),
      log: () => {},
    }),
  };
}

// ── a seeded table: the Ashen Court, from the mockup ────────────────────────

export const ST = 'user_st';
export const ISOLDE_PLAYER = 'user_isolde';
export const DMITRI_PLAYER = 'user_dmitri';
export const STRANGER = 'user_stranger';
export const TEAM = 'team_ashen';
export const CHRONICLE = 'chr_ashen';
export const SCENE = 'scene_rookery';
export const ISOLDE = 'char_isolde';
export const DMITRI = 'char_dmitri';

export function ashenCourt(): World {
  const w = world();
  w.teams.teams.set(TEAM, {
    name: 'The Ashen Court',
    members: [
      { userId: ST, roles: ['owner', 'storyteller'] },
      { userId: ISOLDE_PLAYER, roles: ['player'] },
      { userId: DMITRI_PLAYER, roles: ['player'] },
    ],
  });
  w.tables.seed('chronicles', CHRONICLE, {
    name: 'The Ashen Court',
    storytellerId: ST,
    teamId: TEAM,
    tenets: [],
    currentSceneId: SCENE,
    inviteCode: 'ASHEN234',
    botchRule: 'zero-with-a-one-is-a-botch',
    turnSerial: 3,
  });
  w.tables.seed('scenes', SCENE, {
    chronicleId: CHRONICLE,
    name: 'The Rookery Gallery',
    turn: 3,
    turnBase: 0,
    initiative: '[]',
    participants: [ISOLDE, DMITRI],
    active: true,
  });
  w.tables.seed('characters', ISOLDE, {
    chronicleId: CHRONICLE,
    ownerId: ISOLDE_PLAYER,
    clan: 'Toreador',
    sect: 'Camarilla',
    generation: 10,
    attributes: JSON.stringify({ dexterity: 3, wits: 3, appearance: 4, strength: 2 }),
    abilities: JSON.stringify({ firearms: 2, performance: 4, subterfuge: 4 }),
    specialties: JSON.stringify([{ trait: 'performance', text: 'Violin' }]),
    virtues: JSON.stringify({ conscience: 3, selfControl: 3, courage: 2 }),
    path: 'Humanity',
    pathRating: 6,
    willpowerPermanent: 5,
    willpowerTemporary: 3,
    willpowerSpentTurnRef: -1,
    bloodPool: 8,
    bloodPoolMax: 13,
    bloodPerTurn: 1,
    bloodSpentThisTurn: 0,
    bloodSpentTurnRef: -1,
    // X in Bruised, / in Hurt, as on the mockup: −1 to every pool.
    healthBashing: 1,
    healthLethal: 1,
    healthAggravated: 0,
    difficultySealed: false,
    version: 0,
  });
  w.tables.seed('profiles', ISOLDE, { chronicleId: CHRONICLE, name: 'Isolde Marchetti' });
  w.tables.seed('characters', DMITRI, {
    chronicleId: CHRONICLE,
    ownerId: DMITRI_PLAYER,
    clan: 'Brujah',
    generation: 11,
    attributes: JSON.stringify({ strength: 4, dexterity: 3, wits: 2 }),
    abilities: JSON.stringify({ brawl: 4 }),
    specialties: JSON.stringify([]),
    virtues: JSON.stringify({ conscience: 2, selfControl: 2, courage: 4 }),
    pathRating: 5,
    willpowerPermanent: 6,
    willpowerTemporary: 5,
    bloodPool: 4,
    bloodPoolMax: 12,
    bloodPerTurn: 1,
    healthBashing: 0,
    healthLethal: 0,
    healthAggravated: 0,
    version: 0,
  });
  w.tables.seed('profiles', DMITRI, { chronicleId: CHRONICLE, name: 'Dmitri Voss' });
  return w;
}

/** Asserts a handler rejects with the given HTTP status. */
export async function rejects(p: Promise<unknown>, status: number, code?: string) {
  try {
    await p;
  } catch (e: any) {
    if (e?.status !== status) throw new Error(`expected ${status}, got ${e?.status ?? e}: ${e?.message}`);
    if (code && e.code !== code) throw new Error(`expected code ${code}, got ${e.code}`);
    return e;
  }
  throw new Error(`expected a ${status}, but the call succeeded`);
}
