# InboxGPT — Project Context for Claude

**Working directory:** `C:\Users\james\Desktop\RANDOM\AI\InboxGPT`
**Stack:** Next.js 14 (App Router) + TypeScript + Drizzle ORM + PostgreSQL (Supabase) + NextAuth.js (JWT)
**Git:** `main` branch, `Swimhack/InboxGPT` on GitHub
**Live URL:** `https://inboxgpt.fly.dev` (Fly.io, `dfw` region, machine `1781e342c99198`)
**Deploy target:** Fly.io (see `fly.toml`, app name `inboxgpt`)

---

## Architecture snapshot (2026-04-15)

```
src/
├─ app/                        Next.js routes (App Router)
│  ├─ api/
│  │  ├─ accounts/             email/channel account CRUD — legacy Phase 0 shape, broken on Track A
│  │  ├─ auth/                 NextAuth + OAuth callbacks
│  │  ├─ emails/               message list/detail — legacy Phase 0 shape
│  │  ├─ sync/                 IMAP/Gmail sync triggers
│  │  ├─ status/               health check
│  │  └─ user/
│  ├─ inbox/, settings/, login/, register/, welcome/, complete/, help/
│  └─ connect-email/
├─ lib/
│  ├─ ai/                      Anthropic/OpenAI wrappers
│  ├─ auth/
│  │  ├─ config.ts             NextAuth options — Google + Azure + optional Credentials
│  │  ├─ session.ts            getServerSession helpers
│  │  └─ workspace.ts          requireWorkspace / getWorkspace / ig_workspace cookie
│  ├─ crypto/encryption.ts     AES-256-GCM (encrypt/decrypt/encryptJSON/decryptJSON) on ENCRYPTION_KEY
│  ├─ db/
│  │  ├─ schema.ts             Drizzle pgTable definitions — see "Schema divergence" below
│  │  └─ index.ts              pg.Pool, drizzle(), withWorkspace(workspaceId, fn)
│  ├─ email/imap-client.ts     IMAP fetch/parse via imapflow + mailparser (legacy tsc errors)
│  └─ queue/simple-queue.ts    in-DB job queue (table `jobs`) — replaces BullMQ
└─ workers/*.worker.ts         LEGACY BullMQ workers (unused; kept for reference only)
```

**Runtime job backend:** `src/lib/queue/simple-queue.ts` (Postgres-only). The `workers/` directory contains older BullMQ scripts that are no longer wired up and fail `tsc` — do not resurrect without intent.

---

## Database: Supabase project `cmypcyozjhbctdkncoms`

- **Project URL:** `https://cmypcyozjhbctdkncoms.supabase.co`
- **Anon key (publishable):** `sb_publishable_JahW3SPO4AQYm_QzsfyzNg_WWfWbveL`
- **Access via MCP** (`.mcp.json` has Supabase configured): use `mcp__supabase__*` tools — no DB password needed for admin ops.
- **DB password** (for `DATABASE_URL`): must be copied from Supabase dashboard → Project Settings → Database.

### Migrations already applied (via `mcp__supabase__apply_migration`)

**Phase 0 (superseded — tables dropped):**
1. `inboxgpt_phase0_extensions_and_enums` — enables citext, vector; creates Phase 0 enums.
2. `inboxgpt_phase0_tables` — original 10-table email-only schema.
3–6. RLS, grants, advisor fixes, global-table lockdown.

**Phase 0 teardown:**
7. `inboxgpt_drop_phase0` — dropped all Phase 0 tables + enums + `app_current_workspace()` function.

**Track A (current live schema):**
8. `inboxgpt_track_a_enums` — 8 enums: `channel_provider` (12 providers), `channel_status`, `workspace_role`, `message_direction`, `ai_category`, `ai_priority`, `job_type` (9 types), `job_status`.
9. `inboxgpt_track_a_tables` — 19 tables: `users`, `accounts`, `sessions`, `verification_tokens`, `workspaces`, `workspace_members`, `invitations`, `channel_accounts`, `threads`, `messages` (with tsvector + vector(1536) + HNSW index), `attachments`, `contacts`, `identities`, `audit_log`, `webhook_events`, `oauth_states`, `jobs`, `ai_usage`, `notification_preferences`. All IDs are UUID with `gen_random_uuid()` default.
10. `inboxgpt_track_a_rls_and_grants` — `app_current_workspace()` returns UUID, RLS + FORCE on 15 workspace-scoped tables, grants to `authenticated` role, global tables (users/sessions/accounts/verification_tokens) locked down via REVOKE from anon/authenticated.

### RLS verified end-to-end (Track A)
As the `authenticated` role (which does not bypass RLS):
- `SET app.workspace_id='<uuid-a>'` → sees only workspace A rows.
- `SET app.workspace_id='<uuid-b>'` → sees only workspace B rows.
- No context → 0 rows.
- Cross-workspace `INSERT` → rejected by `WITH CHECK`.

### Advisors (final state)
- 0 ERROR on RLS.
- 1 WARN: `webhook_events` has permissive `WITH CHECK (true)` — intentional (webhook handlers insert before workspace is resolved).
- 2 WARN: citext + vector installed in `public` schema (cosmetic; relocating risks breaking column types).
- 4 INFO: users/sessions/accounts/verification_tokens RLS-enabled-no-policy (intentional — locked down via REVOKE).

---

## Schema alignment status

**DB and source are now aligned on Track A.** Supabase has the full 19-table schema matching `src/lib/db/schema.ts`. Back-compat aliases exist:

```ts
export const emailAccounts = channelAccounts;
export const emails = messages;
```

**Remaining code-side errors (~95 tsc errors):** Legacy API routes (`/api/accounts`, `/api/emails`, `/api/sync`) and `src/lib/auth/config.ts` still reference Phase 0 column names (`email`, `providerType`, `folder`, `isArchived`, `userId`, `accountId`, `encryptedAccessToken`) that don't exist on the Track A `channel_accounts`/`messages` tables. These routes need rewriting to use Track A columns (`provider`, `externalAccountId`, `credentialsEncrypted`, `direction`, `providerMessageId`, etc.).

Build passes (`typescript.ignoreBuildErrors=true`). Runtime will fail on any route that hits these stale queries.

---

## Fly.io deployment

- **App name:** `inboxgpt`
- **URL:** `https://inboxgpt.fly.dev`
- **Region:** `dfw`
- **Secrets set:** `DATABASE_URL` (direct Supabase connection), `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. OAuth + AI keys are placeholder empty strings — set when ready.
- **Connection:** Direct (`db.cmypcyozjhbctdkncoms.supabase.co:5432`). The session pooler (`aws-0-us-east-1.pooler.supabase.com`) returned "Tenant not found" — may be wrong region. Check Supabase dashboard for correct pooler hostname and switch to it for production scaling.
- **Deploy:** `fly deploy --ha=false` from project root. Secrets via `fly secrets set KEY=val -a inboxgpt`.
- **`fly.toml`** has non-secret env vars (`DATABASE_SSL`, `NEXTAUTH_URL`, etc.). No mounts (SQLite removed).

## Local development

```bash
# 1. Put the Supabase direct connection URL with real password into .env:
#    DATABASE_URL=postgresql://postgres:<PASSWORD>@db.cmypcyozjhbctdkncoms.supabase.co:5432/postgres
#    DATABASE_SSL=true
#    DATABASE_SSL_REJECT_UNAUTHORIZED=false
#    DATABASE_USE_AUTHENTICATED_ROLE=true
# 2. Run
npm install
npm run dev              # http://localhost:3000
npm run build            # prod build
npx tsc --noEmit         # strict type-check (currently has ~95 migration-related errors)
```

### Useful Drizzle commands
```bash
npm run db:generate      # drizzle-kit generate — emits SQL from schema.ts
npm run db:push          # drizzle-kit push — applies schema to DATABASE_URL
npm run db:studio        # drizzle-kit studio GUI
```
Supabase MCP tools (`mcp__supabase__apply_migration`, `execute_sql`, `get_advisors`) are preferred over direct `db:push` because they produce a proper migration audit trail in the Supabase dashboard.

---

## Environment variables

Set in `.env` (real secrets, gitignored) and `.env.example` (committed template).

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (Supabase pooler recommended) |
| `DATABASE_SSL=true` | Required for Supabase |
| `DATABASE_SSL_REJECT_UNAUTHORIZED=false` | Supabase uses a self-signed chain under pooler |
| `DATABASE_USE_AUTHENTICATED_ROLE=true` | Keeps `SET LOCAL ROLE authenticated` active inside `withWorkspace` |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | NextAuth.js |
| `ENCRYPTION_KEY` | 32-byte hex — AES-256-GCM for OAuth tokens + IMAP creds |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail OAuth (scopes include `gmail.modify`) |
| `AZURE_AD_CLIENT_ID/_SECRET/_TENANT_ID` | Outlook OAuth |
| `AUTH_ALLOW_PASSWORD` | set `true` to enable CredentialsProvider |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | AI features |
| `REDIS_URL` | legacy, unused by simple-queue |

---

## Key conventions & decisions (don't relitigate)

- **Tenancy via `workspaces` + `workspace_members`**; not per-user rows.
- **RLS as defense-in-depth**, not primary auth: the app also filters by workspaceId in queries.
- **`SET LOCAL app.workspace_id` inside a transaction** (`withWorkspace` helper) so RLS works with connection pooling.
- **`SET LOCAL ROLE authenticated`** inside the same tx so BYPASSRLS is dropped for request-scoped queries.
- **JWT session strategy** (no DB session rows) — avoids Auth.js adapter tables.
- **Tokens encrypted at rest** via `src/lib/crypto/encryption.ts` using AES-256-GCM; per-workspace DEKs (wrapped by `APP_KEK`) are planned but not yet implemented.
- **`typescript.ignoreBuildErrors=true`** in `next.config.js` — flip to `false` only after Track A/B sync is complete.

---

## Current follow-ups (in priority order)

1. **Rewrite `src/lib/auth/config.ts`** to use Track A column names (`channelAccounts.provider`, `channelAccounts.credentialsEncrypted`, `channelAccounts.externalAccountId`, etc.) instead of Phase 0 names. Current version uses `emailAccounts.email`, `emailAccounts.providerType`, `emailAccounts.encryptedAccessToken` — these don't exist on Track A.
2. **Rewrite legacy API routes** under `/api/accounts`, `/api/emails`, `/api/sync` to query `messages`/`channelAccounts` Track A columns (~95 tsc errors).
3. **Pre-existing `src/lib/email/imap-client.ts` mailparser type errors** (4) — not introduced by this migration, but blocks turning strict tsc back on.
4. **Per-workspace DEK wrapping** (`src/lib/crypto/encryption.ts` needs `wrapKey/unwrapKey` using `APP_KEK`).
5. **`workers/*.worker.ts` legacy BullMQ scripts** — delete or exclude from tsconfig; they emit ~13 tsc errors.
6. **Move citext + vector extensions** out of `public` schema (cosmetic Supabase advisor).
7. **Switch Fly DATABASE_URL from direct connection to session pooler** once correct pooler hostname is confirmed from Supabase dashboard (direct works but doesn't pool connections).

---

## Handoff documents

- `HANDOFF.md` — migration state from the prior agent (context + decisions).
- `C:\Users\james\.claude\plans\rippling-tickling-lamport.md` — full plan of record.
- `C:\Users\james\.claude\context-bridge.md` — cross-terminal status.
- `C:\Users\james\.claude\projects\C--Users-james-Desktop-RANDOM-AI-InboxGPT\memory\` — auto-memory.
