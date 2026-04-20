# InboxGPT Unified-Inbox Migration — Handoff

**Date:** 2026-04-15
**Last commit:** `e520248` *(Phase 0 + Phase 1 scaffolding for unified inbox)*
**Plan of record:** `C:\Users\james\.claude\plans\rippling-tickling-lamport.md`
**Working tree:** `src/lib/db/schema.ts` has one uncommitted modification (schema was pared back to a pragmatic Phase 0 shape — see §2). Do not revert.

---

## 1. What's on main (committed at e520248)

**Phase 0 infra (all ready to run once Postgres is reachable):**
| File | Purpose |
|------|---------|
| `docker-compose.yml` | `pgvector/pgvector:pg16` + healthcheck + volume |
| `scripts/postgres-init.sql` | Enables `uuid-ossp`, `pgcrypto`, `citext`, `vector` on first boot |
| `drizzle.config.ts` | `dialect: 'postgresql'` |
| `drizzle/0001_rls_policies.sql` | Row-level security policies keyed off `current_setting('app.workspace_id')` |
| `src/lib/db/index.ts` | `pg.Pool` + `withWorkspace(id, fn)` tx helper issuing `SET LOCAL app.workspace_id` |
| `src/lib/auth/workspace.ts` | `requireWorkspace()` / `getWorkspace()` / `setActiveWorkspace()` |
| `.env.example` | Postgres URL, `APP_KEK`, Tier‑1 + Tier‑2 provider secrets |
| `package.json` | `pg`, `@types/pg`, `tweetnacl` added; `better-sqlite3` retained for the migration script only |

**Phase 1 scaffolding (written against the ambitious `messages`/`channelAccounts` schema — currently broken, see §3):**
| File | Purpose |
|------|---------|
| `src/lib/auth/config.ts` | Google + Azure NextAuth providers; `signIn` callback auto-creates workspace + membership + zero-click channel connect |
| `src/lib/channels/{types,gmail,outlook,imap,twilio,slack,discord,meta,x,linkedin,index}.ts` | Adapter registry with `connect` / `sendMessage` / `normalizeInbound` contract |
| `src/lib/webhooks/verify.ts` | Twilio (HMAC-SHA1), Slack (HMAC-SHA256 + 5-min skew), Discord (Ed25519), Meta (HMAC-SHA256) |
| `src/lib/webhooks/enqueue.ts` | Idempotent `webhook_events` upsert + `normalize-inbound` job enqueue |
| `src/app/api/webhooks/{twilio,slack,discord}/route.ts` | Signed POST routes with URL-verification handshake |

`next build` passes. `npx tsc --noEmit` emits ~92 errors (see §3).

---

## 2. Schema state — pragmatic Phase 0 (uncommitted)

`src/lib/db/schema.ts` has been reset to keep the **existing email-centric tables** (`emails`, `emailAccounts`, `attachments`, `sessions`, `jobs`, `aiUsage`) and add tenancy on top:

**New tables:**
- `workspaces(id text pk, slug unique, name, plan, dek_wrapped bytea, retention_days, …)`
- `workspace_members(workspace_id, user_id, role, pk)`
- `invitations(id, workspace_id, email citext, role, token unique, expires_at, …)`

**Added columns** (nullable in Phase 0, backfill + NOT NULL in Phase 1):
- `email_accounts.workspace_id`, `emails.workspace_id`, `attachments.workspace_id`, `jobs.workspace_id`, `ai_usage.workspace_id`
- `email_accounts.is_active` kept; `syncStatus` enum kept

**Intentionally absent (deferred beyond Phase 0):**
- `channel_accounts`, `messages` (single-table polymorphism), `threads`, `webhook_events`, `oauth_states`, `identities`, `contacts`, `audit_log`, `notification_preferences`
- `tsvector` generated column, `vector(1536)`, HNSW index
- Auth.js `accounts`/`verification_tokens` tables (JWT strategy is kept)

**Upside:** legacy API routes (`src/app/api/accounts`, `src/app/api/emails`, `src/app/api/sync`, `src/app/api/status`) already compile against this shape (they use `email`/`accountId`/`folder`/`syncStatus`/`isArchived`/`emailsProcessed` — all still present).

**Downside:** the Phase 1 scaffolding I committed at e520248 expected the ambitious shape and is now broken (§3).

---

## 3. Broken files (92 tsc errors, suppressed by `ignoreBuildErrors=true`)

Run `npx tsc --noEmit` to see them. They cluster into three groups:

### 3a. Phase 1 scaffolding referencing missing tables
- **`src/lib/auth/config.ts`** — calls `schema.channelAccounts` (lines 116-190) and sets `users.image` / `users.emailVerified` (lines 49-85). Fix: either (A) re-introduce `channelAccounts` + `users.image` to schema, or (B) rewrite the callback to upsert into `emailAccounts` instead (provider is `'gmail'`/`'outlook'`, store tokens in `encryptedAccessToken`/`encryptedRefreshToken`).
- **`src/lib/channels/types.ts`** — imports `ChannelAccount`, `NewMessage` from schema (don't exist).
- **`src/lib/channels/{gmail,outlook,imap,twilio,slack,discord,meta,x,linkedin}.ts`** — all import `ChannelAccount`.
- **`src/lib/webhooks/enqueue.ts`** — references `schema.webhookEvents` and `schema.channelProvider` enum (don't exist). Can be rewritten to insert into `jobs` only, skipping the idempotency table for now.
- **`src/lib/auth/workspace.ts`** — queries `schema.workspaces.slug` (exists) but returns `workspaceSlug` from memberships. Should still compile; re-check.

### 3b. Legacy files (pre-existing, not introduced by this migration)
- **`src/lib/email/imap-client.ts`** — 4 errors; `mailparser` type narrowing. Pre-existing.
- **`src/lib/queue/simple-queue.ts`** — 2 errors; `pg.QueryResult.changes` does not exist (SQLite-era API). Need to use `rowCount` instead now that `db` is node-postgres.

### 3c. Auth.js credentials shape
- `src/lib/auth/config.ts:237` — `authorize` return type must have `name: string`, not `string | null`. One-line fix: `name: user.name ?? undefined`.

---

## 4. What's blocked on the host

- **Docker Desktop is not installed** on the Windows laptop. You cannot `docker compose up postgres` from this machine. Two options:
  1. Install Docker Desktop, then `docker compose up -d postgres && npm run db:push && psql "$DATABASE_URL" -f drizzle/0001_rls_policies.sql`.
  2. Point `DATABASE_URL` at a managed pgvector Postgres (Supabase / Neon / Fly pgvector) and do the same `db:push` + RLS apply against it.

---

## 5. Suggested next steps, in order

> Pick **Track A** if you want to honor the committed Phase 1 scaffolding (channels + messages). Pick **Track B** if you want to match the reverted, pragmatic schema and ship a Postgres-only email inbox first, then add channels later.

### Track A — restore the ambitious schema (recommended if the goal is true unified inbox)
1. Re-add to `src/lib/db/schema.ts`: `channelAccounts`, `messages` (with `tsvector` + `vector(1536)`), `threads`, `webhookEvents`, `oauthStates`, `identities`, `contacts`, `auditLog`, `notificationPreferences`; plus `users.image`, `users.emailVerified`. Keep `emails`/`emailAccounts` as deprecated aliases or drop entirely and rewrite the legacy API routes.
2. `docker compose up -d postgres` → `npm run db:push` → apply `drizzle/0001_rls_policies.sql`.
3. Rewrite legacy API routes (`api/{accounts,emails,sync,status}/route.ts`, `src/lib/ai/limits.ts`) to query `messages` + `channelAccounts` (~70 errors, mostly mechanical renames).
4. Re-enable strict TS by flipping `typescript.ignoreBuildErrors` to `false` in `next.config.js`.
5. Implement `workers/normalize-inbound.worker.ts` — dequeues the `normalize-inbound` jobs the webhook routes already enqueue, dispatches to `adapter.normalizeInbound`, upserts `messages` + `threads`, enqueues `ai-processing`.

### Track B — ship Phase 0 as-is, defer channels to Phase 1
1. **Delete or exclude** the Phase 1 scaffolding that doesn't compile:
   - `git rm src/lib/channels/*.ts src/lib/webhooks/enqueue.ts src/app/api/webhooks/{twilio,slack,discord}/route.ts`
   - Or guard them in tsconfig `exclude` until channel work resumes.
2. Simplify `src/lib/auth/config.ts` so `signIn` upserts into the existing `emailAccounts` table for Google/Azure — preserves the zero-click Gmail connect without introducing new tables.
3. Fix `src/lib/queue/simple-queue.ts` (`result.changes` → `result.rowCount`) and `src/lib/auth/config.ts:237` (`name` nullability).
4. Decide on a Postgres host → `npm run db:push` → apply RLS.
5. Start adding channels one at a time (Twilio first — cheapest approval) by reintroducing the specific tables they need.

---

## 6. Verification checklist (from the plan §Verification Plan)

Run in order once Postgres is up:
1. `docker compose up -d postgres` and `psql -c 'CREATE EXTENSION vector;'` (init SQL does this already).
2. `npm run db:generate && npm run db:push` — `\d emails` should show `workspace_id` column.
3. `psql "$DATABASE_URL" -f drizzle/0001_rls_policies.sql`.
4. `npm run dev` → Google sign-in → confirm `workspaces` + `workspace_members` rows appear; then (Track A) `channel_accounts` / (Track B) `email_accounts`.
5. `ngrok http 3000` → Twilio SMS test → `webhook_events` has one row, `jobs` has a `normalize-inbound` job.
6. Tenant isolation: call `/api/emails?workspaceId=<other>` as user A → expect 0 rows.
7. RLS smoke: `SET app.workspace_id = '<B>'; SELECT count(*) FROM emails;` returns only B's rows.

---

## 7. Key decisions already made (don't relitigate)

- **Node-postgres + Pool** (not Neon serverless driver) — chosen because local Docker is the deploy target.
- **`SET LOCAL app.workspace_id`** (not session-level) — RLS must work with connection pooling.
- **JWT session strategy** (not database sessions) — avoids needing the Auth.js adapter + extra tables.
- **Tier 1 ships without vendor approval** (Gmail/Outlook/IMAP/Twilio/Slack/Discord); Tier 2 (Meta/X/LinkedIn) is stubbed behind feature flags.
- **Webhook idempotency via `webhook_events` unique(provider, external_event_id)`** — plan-of-record; Track B may substitute a Redis-backed dedupe if the table is skipped.
- **Per-workspace DEK** wrapped by `APP_KEK` — extends existing AES-256-GCM helper; implementation not yet written (will live in `src/lib/crypto/encryption.ts`).

---

## 8. Context you'll want

- **Plan:** `C:\Users\james\.claude\plans\rippling-tickling-lamport.md`
- **Memory notes:** `C:\Users\james\.claude\projects\C--Users-james-Desktop-RANDOM-AI-InboxGPT\memory\`
- **Key enum already defined in schema:** `providerTypeEnum = ['gmail','outlook','imap']` — extend this in Track A step 1 to cover all 12 channels.
- **Deployment:** Fly.io via `fly.toml`; postgres needs a pgvector-enabled image for Phase 2 (HNSW search). `next.config.js` has `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` — flip these back to false once Track A/B tsc errors are fixed.
- **User preference:** "run it all" means proceed autonomously without checking in; only pause for genuine blockers (e.g. Docker not installed).

— Opus
