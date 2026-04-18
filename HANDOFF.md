# InboxGPT — Agent Handoff Document

**Last updated:** 2026-04-18
**Repo:** https://github.com/Swimhack/InboxGPT
**Live URL:** https://inboxgpt.stricklandai.com (pending DNS update)
**VPS:** 137.184.136.55 (Ubuntu 24.04, DigitalOcean)

---

## 1. What Is InboxGPT?

A privacy-first, self-hostable AI-powered unified email inbox. Users connect multiple email accounts (Gmail, Outlook, Yahoo, iCloud, any IMAP), and the app syncs emails, categorizes them with AI, generates summaries, suggests quick replies, and provides daily inbox briefs.

**Key design principles:**
- No Redis, no external queues — everything runs in-process with SQLite
- All credentials encrypted at rest (AES-256-GCM)
- Self-hostable for complete data control
- Supports both Anthropic Claude and OpenAI GPT

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router) |
| Database | SQLite via Drizzle ORM |
| UI | Tailwind CSS + shadcn/ui |
| Auth | NextAuth.js (credentials + OAuth) |
| Email Sync | ImapFlow (IMAP) |
| Email Send | Nodemailer (SMTP) |
| AI | Anthropic Claude / OpenAI GPT |
| Process Manager | PM2 |
| Reverse Proxy | Nginx |
| Tests | Vitest (26 tests passing) |

---

## 3. Project Structure

```
/home/james/InboxGPT/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/          # NextAuth + register endpoint
│   │   │   ├── accounts/      # CRUD accounts, test connection
│   │   │   ├── emails/        # List, get, patch, delete, send, search
│   │   │   ├── brief/         # AI inbox brief generation
│   │   │   ├── sync/          # Trigger sync, get status
│   │   │   └── settings/      # AI key storage (BYOK)
│   │   ├── (auth)/            # Login, register pages
│   │   ├── (dashboard)/       # Inbox, compose, search, settings
│   │   └── (onboarding)/      # Welcome, connect-email, complete
│   ├── components/
│   │   ├── accounts/          # SetupWizard, ProviderPicker, AccountList
│   │   ├── inbox/             # EmailList, EmailDisplay, AIBrief
│   │   ├── ai/               # SummaryPanel, QuickReplies, AIExplainer
│   │   ├── dashboard/         # Header, Sidebar, StatusBar
│   │   └── ui/               # shadcn components
│   ├── lib/
│   │   ├── ai/               # client.ts, prompts.ts, brief.ts, limits.ts
│   │   ├── db/               # schema.ts, index.ts, migrate.ts
│   │   ├── email/            # imap-client.ts, smtp-client.ts, provider-config.ts
│   │   ├── queue/            # SQLite-based job queue (no Redis)
│   │   ├── auth/             # NextAuth config, session helpers
│   │   └── crypto/           # AES-256-GCM encryption
│   └── __tests__/            # Vitest tests (26 passing)
├── data/
│   └── inboxpro.db           # SQLite database (23MB)
├── .env                       # Configuration (see section 5)
├── fly.toml                   # Fly.io config (deprecated, using VPS now)
└── package.json
```

---

## 4. Database Schema (SQLite via Drizzle)

| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, passwordHash, onboarding state, AI config) |
| `emailAccounts` | Connected email accounts (encrypted IMAP/SMTP creds, sync status) |
| `emails` | Synced emails (subject, body, AI fields: summary, category, priority, replies) |
| `attachments` | Email attachment metadata (filename, mimeType, size — no file storage yet) |
| `sessions` | NextAuth sessions |
| `jobs` | Background job queue (sync, AI processing) |
| `aiUsage` | AI quota tracking per user per day |

**Important:** All sensitive fields (IMAP host, SMTP host, credentials, OAuth tokens, user API keys) are encrypted with AES-256-GCM using `ENCRYPTION_KEY`.

---

## 5. Environment Variables

```bash
# /home/james/InboxGPT/.env
DATABASE_URL=/home/james/InboxGPT/data/inboxpro.db
NEXTAUTH_SECRET=<session-encryption-key>
NEXTAUTH_URL=https://inboxgpt.stricklandai.com
ENCRYPTION_KEY=<64-char-hex-for-credential-encryption>
ANTHROPIC_API_KEY=<claude-api-key>
PORT=3103
NEXT_PUBLIC_BASE_PATH=  # Empty = root, set to /inbox for subpath deployment
```

---

## 6. Deployment Details

### PM2 Process
- **Name:** `inboxgpt` (PM2 id: 2)
- **Port:** 3103
- **CWD:** `/home/james/InboxGPT`
- **Command:** `npm start -- --port 3103`
- **Restart:** `pm2 restart inboxgpt`
- **Logs:** `pm2 logs inboxgpt`
- **Rebuild + restart:** `npm run build && pm2 restart inboxgpt`

### Nginx
- **Config:** `/etc/nginx/sites-enabled/inboxgpt.stricklandai.com.conf`
- **HTTP only** until DNS is updated and SSL cert is obtained
- **SSL setup (after DNS):**
  ```bash
  sudo certbot certonly --webroot -w /var/www/sites/inboxgpt.stricklandai.com/public -d inboxgpt.stricklandai.com
  ```
  Then update the nginx config to use the SSL block (template at `/home/james/inboxgpt.stricklandai.com.conf`).

### DNS Action Required
`inboxgpt.stricklandai.com` currently points to `strickland.fly.dev` (66.241.125.19).
**Must be updated** to point to VPS IP: `137.184.136.55` (A record).

### agents.stricklandai.com
Updated to redirect `/inbox` and `/` to `https://inboxgpt.stricklandai.com`. The `/jljlaw` and `/megamass` routes are preserved.

---

## 7. What's Working

- User registration and login (email/password)
- Multi-account email connection (Gmail, Outlook, Yahoo, iCloud, custom IMAP)
- Email sync via IMAP (full and incremental)
- AI email summarization, categorization, priority detection
- AI quick reply suggestions (3 per email)
- AI daily inbox brief generation
- Email send via SMTP (compose page)
- Reply, Reply All, Forward with pre-filled compose
- Quick reply click → compose with AI suggestion pre-filled
- Background job queue (in-process SQLite, auto-starts with Next.js)
- Encrypted credential storage
- SetupWizard with provider auto-detection
- 26 tests passing (brief, prompts, encryption, API routes)

---

## 8. What's Incomplete / Known Issues

### High Priority
1. **DNS not updated** — `inboxgpt.stricklandai.com` still points to Fly.io, not VPS
2. **SSL cert needed** — Once DNS propagates, run certbot and update nginx config
3. **Attachment storage** — Metadata tracked in DB but no file backend (no downloads)
4. **OAuth token refresh** — No auto-refresh when tokens expire; manual re-auth needed

### Medium Priority
5. **Email threading** — `threadId` field exists in schema but unused in UI
6. **Search** — Basic LIKE query; should use SQLite FTS5 for full-text search
7. **Email sending not fully tested** — SMTP client implemented but limited real-world testing
8. **Fly.io deployment broken** — Needs volume in dfw region; abandoned in favor of VPS

### Lower Priority
9. Attachment file upload/download
10. Advanced search filters
11. Email templates/signatures
12. Forwarding, delegation, shared mailboxes

---

## 9. Key Architecture Decisions

1. **No Redis** — The job queue is SQLite-based (`lib/queue/simple-queue.ts`). Jobs are polled in-process. This keeps the stack simple but means jobs only run while the app is running.

2. **BasePath is env-driven** — `NEXT_PUBLIC_BASE_PATH` controls the basePath in `next.config.js`. Empty = root. Set to `/inbox` for subpath deployments (like the old `agents.stricklandai.com/inbox` setup).

3. **Session provider basePath** — `components/providers.tsx` constructs the NextAuth basePath from `NEXT_PUBLIC_BASE_PATH`. If you change deployment paths, this auto-adjusts.

4. **Instrumentation hook** — `src/instrumentation.ts` auto-starts the background worker when Next.js boots. This handles email sync and AI processing jobs.

5. **AI limits** — Free tier: 50 emails lifetime, $20/month global budget. Users can bring their own API key (BYOK) via settings to bypass limits.

---

## 10. Common Operations

```bash
# Restart the app
pm2 restart inboxgpt

# View logs
pm2 logs inboxgpt --lines 100

# Rebuild after code changes
cd /home/james/InboxGPT && npm run build && pm2 restart inboxgpt

# Run tests
cd /home/james/InboxGPT && npx vitest run

# Check database
sqlite3 /home/james/InboxGPT/data/inboxpro.db ".tables"
sqlite3 /home/james/InboxGPT/data/inboxpro.db "SELECT count(*) FROM emails;"

# Push schema changes
npm run db:push

# Nginx
sudo nginx -t && sudo nginx -s reload
```

---

## 11. Git History (Key Commits)

```
8a9ab80 Make basePath env-driven for inboxgpt.stricklandai.com deployment
afaf530 Add AI brief, setup wizard, reply/forward actions, and test suite
283ec35 Sync local changes
d979a0e Add public directory placeholder and fix Dockerfile
a7f9eed Initial commit: InboxGPT email automation project
```

---

## 12. Immediate Next Steps

1. **Update DNS** for `inboxgpt.stricklandai.com` → A record to `137.184.136.55`
2. **Get SSL cert** with certbot after DNS propagation
3. **Update nginx** to the SSL config (template exists in repo root)
4. **Test end-to-end** — register, add email account, sync, view inbox, send reply
5. **Consider** implementing OAuth token refresh for long-lived accounts
