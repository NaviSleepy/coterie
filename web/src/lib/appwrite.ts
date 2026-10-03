/**
 * The browser's Appwrite client. Every read here runs with the player's own
 * session, so Appwrite's row permissions decide what comes back — the client
 * never filters secrets, it simply never receives them.
 *
 * Every write with stakes goes through `call()`, which executes a Function and
 * turns its JSON envelope back into a value or a typed error.
 */

import { env } from '$env/dynamic/public';
import { Account, Channel, Client, Functions, Query, Realtime, Storage, TablesDB, Teams } from 'appwrite';

import { DATABASE_ID, type FunctionId, type TableId } from '$schema';

export const client = new Client()
  .setEndpoint(env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://cloud.appwrite.io/v1')
  .setProject(env.PUBLIC_APPWRITE_PROJECT_ID ?? 'coterie');

export const account = new Account(client);
export const tables = new TablesDB(client);
export const teams = new Teams(client);
export const functions = new Functions(client);
export const realtime = new Realtime(client);
export const storage = new Storage(client);

export { Query };

export type AnyRow = { $id: string; $createdAt: string; $updatedAt: string; $permissions: string[] } & Record<
  string,
  any
>;

export async function listRows<T extends AnyRow = AnyRow>(table: TableId, queries: string[]): Promise<T[]> {
  const res = await tables.listRows({ databaseId: DATABASE_ID, tableId: table, queries });
  return res.rows as unknown as T[];
}

/** Every matching row, a page at a time, for tables that can outgrow one page. */
export async function listAll<T extends AnyRow = AnyRow>(table: TableId, queries: string[], page = 500): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    const last = out[out.length - 1];
    const rows = await listRows<T>(table, [...queries, Query.limit(page), ...(last ? [Query.cursorAfter(last.$id)] : [])]);
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export async function getRow<T extends AnyRow = AnyRow>(table: TableId, rowId: string): Promise<T | null> {
  try {
    return (await tables.getRow({ databaseId: DATABASE_ID, tableId: table, rowId })) as unknown as T;
  } catch (e) {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  }
}

export function channel(table: TableId): string {
  return Channel.tablesdb(DATABASE_ID).table(table).row().toString();
}

/** A Function said no: forbidden, a rules refusal, a conflict. `message` is UI copy. */
export class CallError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function call<T = any>(fn: FunctionId, body: Record<string, unknown>): Promise<T> {
  const execution = await functions.createExecution({
    functionId: fn,
    body: JSON.stringify(body),
    async: false,
  });
  let parsed: any = null;
  try {
    parsed = execution.responseBody ? JSON.parse(execution.responseBody) : null;
  } catch {
    // fall through to the status check
  }
  const status = execution.responseStatusCode;
  if (status >= 200 && status < 300) return parsed as T;
  throw new CallError(
    status || 500,
    parsed?.error ?? 'internal',
    parsed?.message ?? 'The Storyteller\'s table did not answer. Try again.',
  );
}

/** A deterministic, valid Appwrite id for this user's presence row in a chronicle. */
export function presenceId(chronicleId: string, userId: string): string {
  const h = (s: string, seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const key = `${chronicleId}:${userId}`;
  return `p${h(key, 1)}${h(key, 2)}`.slice(0, 36);
}
