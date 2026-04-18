import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const databaseUrl = (process.env.DATABASE_URL || './data/inboxpro.db').replace(/^file:\/\//, '').replace(/^file:/, '');

let _db: BetterSQLite3Database<typeof schema> | null = null;

function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  // Ensure data directory exists
  const dbDir = dirname(databaseUrl);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(databaseUrl);

  // Enable WAL mode for better concurrent access
  sqlite.pragma('journal_mode = WAL');

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  _db = drizzle(sqlite, { schema });
  return _db;
}

// Lazy database accessor
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_, prop) {
    return (getDatabase() as any)[prop];
  },
});

export { schema };
