import { Pool, type PoolClient } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL || 'postgres://inboxgpt:inboxgpt@localhost:5432/inboxgpt';

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
  });
  _pool.on('error', (err) => {
    console.error('[pg] unexpected pool error', err);
  });
  return _pool;
}

function getDatabase(): NodePgDatabase<typeof schema> {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

// Lazy proxy so imports don't open a pool until first use (helps with build-time SSR).
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_, prop) {
    return (getDatabase() as any)[prop];
  },
});

export { schema };
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    return (getPool() as any)[prop];
  },
});

/**
 * Run `fn` inside a transaction with `SET LOCAL app.workspace_id = $1`.
 * Use this for every request path that touches workspace-scoped rows so
 * Postgres RLS policies can enforce tenant isolation as defense-in-depth.
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: NodePgDatabase<typeof schema>, client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // set_config(text, text, is_local boolean) is SQL-injection safe via params.
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    const tx = drizzle(client, { schema });
    const result = await fn(tx, client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
