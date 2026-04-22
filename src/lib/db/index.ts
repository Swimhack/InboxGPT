import { Pool, type PoolConfig } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

function buildPoolConfig(): PoolConfig {
  const url = process.env.DATABASE_URL;
  if (!url && process.env.NODE_ENV !== 'test') {
    console.warn('[db] DATABASE_URL is not set; database queries will fail.');
  }

  const cfg: PoolConfig = {
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };

  if (process.env.DATABASE_SSL === 'true') {
    cfg.ssl = {
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
  }

  return cfg;
}

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  _pool = new Pool(buildPoolConfig());
  _pool.on('error', (err) => {
    console.error('[db] idle pool client error', err);
  });
  return _pool;
}

function getDatabase(): NodePgDatabase<typeof schema> {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_, prop) {
    return (getDatabase() as any)[prop];
  },
});

export { schema };

const USE_AUTH_ROLE = process.env.DATABASE_USE_AUTHENTICATED_ROLE === 'true';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` inside a transaction with `app.workspace_id` set for RLS.
 *
 * When DATABASE_USE_AUTHENTICATED_ROLE=true we also `SET LOCAL ROLE
 * authenticated` so RLS policies are enforced (the `postgres` superuser
 * bypasses RLS otherwise).
 *
 * `workspaceId` is validated as a UUID before being interpolated because
 * Postgres does not accept parameters on `SET LOCAL`; we use `set_config`
 * which _does_ accept parameters.
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: NodePgDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(workspaceId)) {
    throw new Error(`withWorkspace: invalid workspace id '${workspaceId}'`);
  }

  return getDatabase().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.workspace_id', ${workspaceId}, true)`);
    if (USE_AUTH_ROLE) {
      await tx.execute(sql`SET LOCAL ROLE authenticated`);
    }
    return fn(tx);
  });
}

/** Close the underlying pool. Useful for tests and graceful shutdown. */
export async function closePool(): Promise<void> {
  if (!_pool) return;
  await _pool.end();
  _pool = null;
  _db = null;
}
