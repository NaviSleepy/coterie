/**
 * The slice of Appwrite's TablesDB and Teams the Functions use, as interfaces.
 * Production passes the real SDK objects straight in; the tests pass an
 * in-memory fake (test/fake.ts) that honours the same contract, including
 * primary-key collisions inside a transaction — the property mutate.ts is
 * built on.
 */

import { DATABASE_ID, type TableId } from './schema.ts';

export interface Row {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  $permissions: string[];
  [key: string]: any;
}

interface Base {
  databaseId: string;
  tableId: string;
}

export interface TablesLike {
  getRow(p: Base & { rowId: string; transactionId?: string }): Promise<Row>;
  listRows(p: Base & { queries?: string[] }): Promise<{ total: number; rows: Row[] }>;
  createRow(
    p: Base & { rowId: string; data: Record<string, any>; permissions?: string[]; transactionId?: string },
  ): Promise<Row>;
  updateRow(
    p: Base & { rowId: string; data?: Record<string, any>; permissions?: string[]; transactionId?: string },
  ): Promise<Row>;
  deleteRow(p: Base & { rowId: string; transactionId?: string }): Promise<unknown>;
  createTransaction(p?: { ttl?: number }): Promise<{ $id: string }>;
  updateTransaction(p: { transactionId: string; commit?: boolean; rollback?: boolean }): Promise<unknown>;
}

export interface TeamsLike {
  create(p: { teamId: string; name: string; roles?: string[] }): Promise<{ $id: string }>;
  createMembership(p: { teamId: string; roles: string[]; userId?: string }): Promise<unknown>;
  listMemberships(p: { teamId: string; queries?: string[] }): Promise<{
    total: number;
    memberships: { $id: string; userId: string; userName: string; roles: string[] }[];
  }>;
}

export function isNotFound(e: unknown): boolean {
  return (e as { code?: number })?.code === 404;
}

export function isConflict(e: unknown): boolean {
  return (e as { code?: number })?.code === 409;
}

/** Staged writes, committed together or not at all. */
export interface Tx {
  create(table: TableId, rowId: string, data: Record<string, any>, permissions: string[]): Promise<void>;
  update(table: TableId, rowId: string, data: Record<string, any>, permissions?: string[]): Promise<void>;
  remove(table: TableId, rowId: string): Promise<void>;
}

export class Store {
  readonly tables: TablesLike;
  readonly teams: TeamsLike;
  constructor(tables: TablesLike, teams: TeamsLike) {
    this.tables = tables;
    this.teams = teams;
  }

  get(table: TableId, rowId: string): Promise<Row> {
    return this.tables.getRow({ databaseId: DATABASE_ID, tableId: table, rowId });
  }

  async find(table: TableId, rowId: string): Promise<Row | null> {
    try {
      return await this.get(table, rowId);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async list(table: TableId, queries: string[]): Promise<Row[]> {
    return (await this.tables.listRows({ databaseId: DATABASE_ID, tableId: table, queries })).rows;
  }

  create(table: TableId, rowId: string, data: Record<string, any>, permissions: string[]): Promise<Row> {
    return this.tables.createRow({ databaseId: DATABASE_ID, tableId: table, rowId, data, permissions });
  }

  update(table: TableId, rowId: string, data: Record<string, any>, permissions?: string[]): Promise<Row> {
    return this.tables.updateRow({ databaseId: DATABASE_ID, tableId: table, rowId, data, permissions });
  }

  /**
   * Runs `stage` against a fresh transaction and commits. Any error — staging
   * or commit — rolls back and rethrows, so a 409 on a ledger row surfaces to
   * the caller with nothing applied.
   */
  async transaction(stage: (tx: Tx) => Promise<void>): Promise<void> {
    const { $id: transactionId } = await this.tables.createTransaction({ ttl: 60 });
    const databaseId = DATABASE_ID;
    const tx: Tx = {
      create: async (tableId, rowId, data, permissions) => {
        await this.tables.createRow({ databaseId, tableId, rowId, data, permissions, transactionId });
      },
      update: async (tableId, rowId, data, permissions) => {
        await this.tables.updateRow({ databaseId, tableId, rowId, data, permissions, transactionId });
      },
      remove: async (tableId, rowId) => {
        await this.tables.deleteRow({ databaseId, tableId, rowId, transactionId });
      },
    };
    try {
      await stage(tx);
      await this.tables.updateTransaction({ transactionId, commit: true });
    } catch (e) {
      await this.tables.updateTransaction({ transactionId, rollback: true }).catch(() => {});
      throw e;
    }
  }
}
