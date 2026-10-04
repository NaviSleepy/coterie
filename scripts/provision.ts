/**
 * Builds (or brings up to date) one Appwrite project from
 * functions/src/shared/schema.ts: the database, every table with row security
 * on, every column and index, the private portrait bucket, and a record for
 * every Function with the scopes and execute permission it needs.
 *
 * Idempotent — run it against staging, then production, as often as you like.
 * It creates what's missing and leaves what exists alone; it never deletes.
 *
 *   APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1 \
 *   APPWRITE_PROJECT_ID=6ab741a5001eb649271f \
 *   APPWRITE_API_KEY=... \
 *   npm run provision
 *
 * The key needs databases/tables/columns/indexes, buckets and functions write.
 * Connecting each Function to the GitHub repo (so pushes to main deploy) is a
 * one-time step in the console; see docs/TECHNICAL.md.
 */

import { Client, Compression, Functions, ID, OrderBy, Query, Runtime, Storage, TablesDB, TablesDBIndexType } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

import {
  DATABASE_ID,
  FUNCTIONS,
  PORTRAITS_BUCKET_ID,
  TABLES,
  type Column,
  type TableDef,
} from '../functions/src/shared/schema.ts';

const endpoint = need('APPWRITE_ENDPOINT');
const project = need('APPWRITE_PROJECT_ID');
const key = need('APPWRITE_API_KEY');

const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
const db = new TablesDB(client);
const fns = new Functions(client);
const storage = new Storage(client);
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

async function ensurePortraitBucket() {
  const spec = {
    bucketId: PORTRAITS_BUCKET_ID,
    name: 'Character portraits',
    // Bucket-level permissions apply to every file and are OR'd with file
    // permissions, so the bucket grants upload only. Reading a portrait comes
    // from the file alone: its owner and the chronicle's Storyteller role.
    permissions: ['create("users")'],
    fileSecurity: true,
    enabled: true,
    maximumFileSize: 5 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    compression: Compression.None,
    encryption: true,
    antivirus: true,
    transformations: true,
  };
  if (await exists(() => storage.getBucket({ bucketId: PORTRAITS_BUCKET_ID }))) {
    await storage.updateBucket(spec);
  } else {
    await storage.createBucket(spec);
    console.log(`+ bucket ${PORTRAITS_BUCKET_ID}`);
  }
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
    if (have.has(col.key)) {
      await growEnum(t.id, col, columns.find((c: any) => c.key === col.key));
      continue;
    }
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

/**
 * An enum that gained choices in the schema gets them added. Choices are never
 * removed, in keeping with never deleting: rows may still hold them.
 */
async function growEnum(tableId: string, col: Column, existing: any) {
  if (col.type !== 'enum' || !existing?.elements) return;
  const missing = col.elements.filter((e) => !existing.elements.includes(e));
  if (missing.length === 0) return;
  await db.updateEnumColumn({
    databaseId: DATABASE_ID,
    tableId,
    key: col.key,
    elements: [...existing.elements, ...missing],
    required: col.required ?? false,
    // The SDK wants the key present; a required column's default must be null.
    xdefault: (col.required ? null : (col.default ?? existing.default ?? null)) as string,
  });
  console.log(`  ~ ${tableId}.${col.key} + ${missing.join(', ')}`);
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

/** Scopes beyond the common four, per Function. */
const EXTRA_SCOPES: Record<string, string[]> = {
  // Adds the Storyteller to portrait files and deletes them with the character.
  character: ['files.read', 'files.write'],
};

async function ensureFunction(id: string) {
  const scopes = ['rows.read', 'rows.write', 'teams.read', 'teams.write', ...(EXTRA_SCOPES[id] ?? [])];
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
    scopes: scopes as any[],
  };
  const current: any = await fns.get({ functionId: id }).catch((e) => {
    if ((e as { code?: number }).code === 404) return null;
    throw e;
  });
  if (!current) {
    await fns.create(spec);
    console.log(`+ function ${id}`);
    return;
  }
  const missing = scopes.filter((s) => !current.scopes.includes(s));
  if (!missing.length) return;
  // An update replaces every field, and one that omits the Git provider fields
  // disconnects the Function from the repo, so send back everything it has.
  await fns.update({
    functionId: id,
    name: current.name,
    runtime: current.runtime,
    execute: current.execute,
    events: current.events,
    schedule: current.schedule,
    timeout: current.timeout,
    enabled: current.enabled,
    logging: current.logging,
    entrypoint: current.entrypoint,
    commands: current.commands,
    scopes: [...current.scopes, ...missing],
    installationId: current.installationId,
    providerRepositoryId: current.providerRepositoryId,
    providerBranch: current.providerBranch,
    providerSilentMode: current.providerSilentMode,
    providerRootDirectory: current.providerRootDirectory,
    ...(current.specification ? { specification: current.specification } : {}),
  });
  console.log(`~ function ${id} scopes + ${missing.join(', ')}`);
}

/**
 * The blank character sheet the web app fills in for "Export as PDF". Signed-in
 * players read it; only the console writes it. SHEET_TEMPLATE, when set, is
 * the uploaded sheet to copy in as `v20-sheet`: "bucketId/fileId".
 */
export const SHEET_BUCKET = 'sheet-templates';
export const SHEET_FILE = 'v20-sheet';
async function ensureSheetTemplates() {
  const spec = { bucketId: SHEET_BUCKET, name: 'Sheet templates', permissions: ['read("users")'], fileSecurity: false, allowedFileExtensions: ['pdf'] };
  if (!(await exists(() => storage.getBucket({ bucketId: SHEET_BUCKET })))) {
    await storage.createBucket(spec);
    console.log(`+ bucket ${SHEET_BUCKET}`);
  }
  const source = process.env.SHEET_TEMPLATE;
  if (!source || (await exists(() => storage.getFile({ bucketId: SHEET_BUCKET, fileId: SHEET_FILE })))) return;
  const [bucketId, fileId] = source.split('/');
  const bytes = await storage.getFileDownload({ bucketId, fileId });
  await storage.createFile({ bucketId: SHEET_BUCKET, fileId: SHEET_FILE, file: InputFile.fromBuffer(Buffer.from(bytes as ArrayBuffer), 'v20-sheet.pdf') });
  console.log(`+ file ${SHEET_BUCKET}/${SHEET_FILE} from ${source}`);
}

/**
 * STARTER_CHRONICLE_ID, when set, is the chronicle whose library every new
 * chronicle copies. It reaches the chronicle Function as an env variable,
 * which takes effect on that Function's next deployment.
 */
async function ensureStarterVariable() {
  const value = process.env.STARTER_CHRONICLE_ID;
  if (!value) return;
  const { variables } = await fns.listVariables({ functionId: 'chronicle' });
  const existing = variables.find((v: any) => v.key === 'STARTER_CHRONICLE_ID');
  if (existing?.value === value) return;
  if (existing) await fns.updateVariable({ functionId: 'chronicle', variableId: existing.$id, key: 'STARTER_CHRONICLE_ID', value });
  else await fns.createVariable({ functionId: 'chronicle', variableId: ID.unique(), key: 'STARTER_CHRONICLE_ID', value });
  console.log(`~ chronicle STARTER_CHRONICLE_ID = ${value} (redeploy the Function to apply)`);
}

await ensureDatabase();
await ensurePortraitBucket();
for (const table of Object.values(TABLES)) await ensureTable(table);
for (const id of FUNCTIONS) await ensureFunction(id);
await ensureStarterVariable();
await ensureSheetTemplates();
console.log(`\n${project} is provisioned: ${Object.keys(TABLES).length} tables, ${FUNCTIONS.length} functions.`);
