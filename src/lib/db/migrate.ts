import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const databaseUrl = process.env.DATABASE_URL || './data/inboxgpt.db';

// Ensure data directory exists
const dbDir = dirname(databaseUrl);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(databaseUrl);
const db = drizzle(sqlite);

console.log('Running migrations...');

migrate(db, { migrationsFolder: './drizzle' });

console.log('Migrations complete!');

// Create FTS5 virtual table for full-text search
console.log('Setting up full-text search...');

sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
    subject,
    from_name,
    from_address,
    body_text,
    content=emails,
    content_rowid=rowid
  );
`);

// Create triggers to keep FTS table in sync
sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON emails BEGIN
    INSERT INTO emails_fts(rowid, subject, from_name, from_address, body_text)
    VALUES (NEW.rowid, NEW.subject, NEW.from_name, NEW.from_address, NEW.body_text);
  END;
`);

sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON emails BEGIN
    INSERT INTO emails_fts(emails_fts, rowid, subject, from_name, from_address, body_text)
    VALUES ('delete', OLD.rowid, OLD.subject, OLD.from_name, OLD.from_address, OLD.body_text);
  END;
`);

sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS emails_au AFTER UPDATE ON emails BEGIN
    INSERT INTO emails_fts(emails_fts, rowid, subject, from_name, from_address, body_text)
    VALUES ('delete', OLD.rowid, OLD.subject, OLD.from_name, OLD.from_address, OLD.body_text);
    INSERT INTO emails_fts(rowid, subject, from_name, from_address, body_text)
    VALUES (NEW.rowid, NEW.subject, NEW.from_name, NEW.from_address, NEW.body_text);
  END;
`);

console.log('Full-text search setup complete!');

sqlite.close();
