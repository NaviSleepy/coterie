/**
 * The Function envelope. Every Function is a pure-ish handler
 * `(ctx, body) → result` wrapped by `entry()`, which does the Appwrite-specific
 * parts: the caller's identity from the x-appwrite-user-id header, the SDK
 * client from the per-execution dynamic key, and the mapping of errors to
 * status codes. Tests call handlers directly with a fake store.
 */

import { Client, TablesDB, Teams } from 'node-appwrite';

import { cryptoDie, type DieSource } from '../../../engine/src/index.ts';
import { Store, type TablesLike, type TeamsLike } from './store.ts';

export interface Ctx {
  store: Store;
  /** Set by Appwrite from the caller's session. Never read from the body. */
  userId: string;
  die: DieSource;
  now: () => Date;
  log: (msg: string) => void;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string) => new HttpError(400, 'bad-request', message);
export const forbidden = (message = 'Not yours to touch.') => new HttpError(403, 'forbidden', message);
export const notFound = (what: string) => new HttpError(404, 'not-found', `${what} not found.`);

/**
 * A rules refusal: the request was well-formed and the caller was allowed to
 * make it, but the game says no. 422 with copy the UI shows verbatim — a
 * refusal explains itself; it never no-ops.
 */
export const refused = (reason: string, message: string) => new HttpError(422, reason, message);

export type Handler<B = any, R = any> = (ctx: Ctx, body: B) => Promise<R>;

interface AppwriteContext {
  req: { headers: Record<string, string | undefined>; bodyJson?: unknown; body?: unknown; method?: string };
  res: { json: (body: unknown, status?: number) => unknown };
  log: (msg: string) => void;
  error: (msg: string) => void;
}

export function entry(name: string, handler: Handler) {
  return async function main({ req, res, log, error }: AppwriteContext) {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'unauthenticated', message: 'Sign in first.' }, 401);

    let body: unknown;
    try {
      body = req.bodyJson ?? (typeof req.body === 'string' && req.body ? JSON.parse(req.body) : {});
    } catch {
      return res.json({ error: 'bad-request', message: 'Body is not JSON.' }, 400);
    }
    if (typeof body !== 'object' || body === null) body = {};

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT!)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID!)
      .setKey(req.headers['x-appwrite-key'] ?? process.env.APPWRITE_API_KEY!);

    const ctx: Ctx = {
      store: new Store(new TablesDB(client) as unknown as TablesLike, new Teams(client) as unknown as TeamsLike),
      userId,
      die: cryptoDie,
      now: () => new Date(),
      log,
    };

    try {
      return res.json(await handler(ctx, body), 200);
    } catch (e) {
      if (e instanceof HttpError) {
        return res.json({ error: e.code, message: e.message }, e.status);
      }
      error(`${name} failed: ${(e as Error)?.stack ?? e}`);
      return res.json({ error: 'internal', message: 'Something went wrong behind the screen.' }, 500);
    }
  };
}

// ── body helpers ────────────────────────────────────────────────────────────

export function str(body: any, key: string, max = 255): string {
  const v = body?.[key];
  if (typeof v !== 'string' || v.trim() === '') throw badRequest(`${key} is required.`);
  return v.trim().slice(0, max);
}

export function optStr(body: any, key: string, max = 255): string | undefined {
  const v = body?.[key];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw badRequest(`${key} must be text.`);
  return v.trim().slice(0, max);
}

export function int(body: any, key: string, min: number, max: number): number {
  const v = body?.[key];
  if (!Number.isInteger(v) || v < min || v > max) {
    throw badRequest(`${key} must be a whole number from ${min} to ${max}.`);
  }
  return v;
}

export function optInt(body: any, key: string, min: number, max: number): number | undefined {
  return body?.[key] === undefined || body?.[key] === null ? undefined : int(body, key, min, max);
}

export function oneOf<T extends string>(body: any, key: string, values: readonly T[]): T {
  const v = body?.[key];
  if (!values.includes(v)) throw badRequest(`${key} must be one of ${values.join(', ')}.`);
  return v;
}
