import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://inboxgpt:inboxgpt@localhost:5432/inboxgpt',
  },
  verbose: true,
  strict: true,
} satisfies Config;
