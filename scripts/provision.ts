/**
 * Builds (or brings up to date) one Appwrite project from
 * functions/src/shared/schema.ts: the database, every table with row security
 * on, every column and index, and a record for every Function with the scopes
 * and execute permission it needs.
 *
 * Idempotent — run it against staging, then production, as often as you like.
 * It creates what's missing and leaves what exists alone; it never deletes.
 *
 *   APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1 \
 *   APPWRITE_PROJECT_ID=coterie-staging \
 *   APPWRITE_API_KEY=... \
 *   npm run provision
 *
 * The key needs databases/tables/columns/indexes write and functions write.
 * Connecting each Function to the GitHub repo (so pushes to main deploy) is a
 * one-time step in the console; see the README.
 */

import { Client, Functions, OrderBy, Query, Runtime, TablesDB, TablesDBIndexType } from 'node-appwrite';

import { DATABASE_ID, FUNCTIONS, TABLES, type Column, type TableDef } from '../functions/src/shared/schema.ts';

const endpoint = need('APPWRITE_ENDPOINT');
const project = need('APPWRITE_PROJECT_ID');
const key = need('APPWRITE_API_KEY');

const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
const db = new TablesDB(client);
const fns = new Functions(client);
// List endpoints default to 25 results; characters alone has more columns than that.
const ALL = [Query.limit(100)];

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
  return v;
}

async function exists(probe: () => Promise<unknown>): Promise<boolean> {
  try {
    await probe();
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 404) return false;
    throw e;
  }
}

async function ensureDatabase() {
  if (await exists(() => db.get({ databaseId: DATABASE_ID }))) return;
  await db.create({ databaseId: DATABASE_ID, name: 'Coterie' });
  console.log(`+ database ${DATABASE_ID}`);
}

async function ensureTable(t: TableDef) {
  const base = { databaseId: DATABASE_ID, tableId: t.id };
  if (await exists(() => db.getTable(base))) {
    // Keep permissions and row security converged even on an existing table.
    await db.updateTable({ ...base, name: t.name, permissions: [...t.permissions], rowSecurity: true });
  } else {
    await db.createTable({ ...base, name: t.name, permissions: [...t.permissions], rowSecurity: true });
    console.log(`+ table ${t.id}`);
  }

  const { columns } = await db.listColumns({ ...base, queries: ALL });
  const have = new Set(columns.map((c: any) => c.key));
  for (const col of t.columns) {
    if (have.has(col.key)) continue;
    await createColumn(t.id, col);
    console.log(`  + ${t.id}.${col.key} (${col.type})`);
  }

  await waitForColumns(t.id);

  const { indexes } = await db.listIndexes({ ...base, queries: ALL });
  const haveIdx = new Set(indexes.map((i: any) => i.key));
  for (const idx of t.indexes) {
    if (haveIdx.has(idx.key)) continue;
    await db.createIndex({
      ...base,
      key: idx.key,
      type: idx.type === 'unique' ? TablesDBIndexType.Unique : TablesDBIndexType.Key,
      columns: [...idx.columns],
      orders: idx.orders?.map((o) => (o === 'DESC' ? OrderBy.Desc : OrderBy.Asc)),
    });
    console.log(`  + index ${t.id}.${idx.key}`);
  }
}

function createColumn(tableId: string, col: Column) {
  const base = { databaseId: DATABASE_ID, tableId, key: col.key, required: col.required ?? false };
  switch (col.type) {
    case 'string':
      return db.createVarcharColumn({
        ...base,
        size: col.size,
        array: col.array,
        xdefault: col.required ? undefined : col.default,
      });
    case 'text':
    case 'json':
      return db.createTextColumn({ ...base, array: col.array });
    case 'integer':
      return db.createIntegerColumn({
        ...base,
        min: col.min,
        max: col.max,
        xdefault: col.required ? undefined : col.default,
      });
    case 'boolean':
      return db.createBooleanColumn({ ...base, xdefault: col.required ? undefined : col.default });
    case 'datetime':
      return db.createDatetimeColumn(base);
    case 'enum':
      return db.createEnumColumn({
        ...base,
        elements: col.elements,
        xdefault: col.required ? undefined : col.default,
      });
  }
}

/** Columns are created asynchronously; indexes on a processing column fail. */
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await db.listColumns({ databaseId: DATABASE_ID, tableId, queries: ALL });
    const pending = columns.filter((c: any) => c.status !== 'available');
    const failed = pending.filter((c: any) => c.status === 'failed' || c.status === 'stuck');
    if (failed.length) throw new Error(`${tableId}: columns failed: ${failed.map((c: any) => c.key).join(', ')}`);
    if (pending.length === 0) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${tableId}: columns still processing after 60s`);
}

async function ensureFunction(id: string) {
  const spec = {
    functionId: id,
    name: id,
    runtime: Runtime.Node22,
    // Any signed-in user may execute; each Function authorizes the caller itself.
    execute: ['users'],
    timeout: 15,
    logging: true,
    entrypoint: `functions/dist/${id}.js`,
    commands: 'npm ci --workspace functions --include-workspace-root && npm run build --workspace functions',
    scopes: ['rows.read', 'rows.write', 'teams.read', 'teams.write'] as any[],
  };
  // Create-only: an update that omits the Git provider fields can disconnect a
  // Function from the repo, so an existing Function is left for the console.
  if (await exists(() => fns.get({ functionId: id }))) return;
  await fns.create(spec);
  console.log(`+ function ${id}`);
}

await ensureDatabase();
for (const table of Object.values(TABLES)) await ensureTable(table);
for (const id of FUNCTIONS) await ensureFunction(id);
console.log(`\n${project} is provisioned: ${Object.keys(TABLES).length} tables, ${FUNCTIONS.length} functions.`);
