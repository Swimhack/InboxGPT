# InboxGPT Killer Brief — Design Spec

## Overview

Transform the AI Brief from an in-app widget into InboxGPT's killer feature: a daily email digest sent every morning that summarizes the user's inbox, flags priority items, detects unanswered follow-ups, and shows emails awaiting their reply. The email itself is the product — users get value without opening the app.

**Target user:** Solo freelancers managing 1+ email accounts who drown in volume and miss important emails.

**Core value prop:** "Never miss an important email again. InboxGPT reads your inbox every morning and tells you exactly what needs your attention."

---

## Morning Brief Email

### Content Structure

The brief email contains these sections in order:

1. **Header** — InboxGPT logo + "Your Morning Brief — [date]"
2. **Stats line** — "14 new emails, 3 need your reply, 1 follow-up overdue"
3. **Priority items** (red left-border) — Emails the AI flags as urgent or time-sensitive. Each item shows: sender (bold), subject, one-line AI summary.
4. **Awaiting your reply** (yellow left-border, Pro only) — Inbound threads where someone replied to the user and the user hasn't responded in 24h+. Shows: sender, subject, time since their reply. Free users see: "3 emails are waiting on you — Upgrade to Pro to see them."
5. **Follow-up reminders** (blue left-border, Pro only) — Outbound emails the user sent 3+ days ago with no response. Shows: recipient, subject, days since sent. Free users see: "2 sent emails got no reply — Upgrade to Pro for follow-up tracking."
6. **Quick digest** — One-line summaries of remaining notable unread emails (newsletters, updates, social).
7. **CTA button** — "Open InboxGPT" → links to `/inbox`
8. **Footer** — "Manage brief settings" (Pro) or "Upgrade to Pro for full brief" (Free). Unsubscribe link.

### Free vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| Priority items | Top 5 | All |
| AI summary per item | Yes | Yes |
| Awaiting your reply | Count only + upgrade teaser | Full list |
| Follow-up reminders | Count only + upgrade teaser | Full list with days elapsed |
| Brief frequency | Daily (morning) | Daily + optional afternoon |
| Stats line | Yes | Yes |
| Quick digest | Top 5 | All |

### Email Format

- HTML email with inline CSS (no external stylesheets — email clients strip them)
- Max-width 600px, centered, white background
- Sections use colored left-border (4px): red = priority, yellow = awaiting reply, blue = follow-up
- Responsive: single column, readable on mobile
- Plain-text fallback included
- From: configurable, default `brief@stricklandai.com`

---

## Follow-Up Detection

### Awaiting Your Reply

Query: inbound messages in threads where the user has NOT sent a more recent outbound message, and the inbound arrived 24h+ ago.

```sql
SELECT m.id, m.subject, m.fromIdentity, m.receivedAt, m.threadId
FROM messages m
WHERE m.workspaceId = $1
  AND m.direction = 'inbound'
  AND m.receivedAt < NOW() - INTERVAL '24 hours'
  AND m.receivedAt > NOW() - INTERVAL '14 days'
  AND NOT EXISTS (
    SELECT 1 FROM messages r
    WHERE r.threadId = m.threadId
      AND r.workspaceId = $1
      AND r.direction = 'outbound'
      AND r.receivedAt > m.receivedAt
  )
ORDER BY m.receivedAt DESC
LIMIT 10
```

### Stale Follow-Ups

Query: outbound messages sent 3+ days ago where no inbound reply exists in the same thread after the send date.

```sql
SELECT m.id, m.subject, m.toIdentities, m.receivedAt, m.threadId
FROM messages m
WHERE m.workspaceId = $1
  AND m.direction = 'outbound'
  AND m.receivedAt < NOW() - INTERVAL '3 days'
  AND m.receivedAt > NOW() - INTERVAL '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM messages r
    WHERE r.threadId = m.threadId
      AND r.workspaceId = $1
      AND r.direction = 'inbound'
      AND r.receivedAt > m.receivedAt
  )
ORDER BY m.receivedAt DESC
LIMIT 10
```

### No New Tables

Both queries use the existing `messages` table with `direction`, `threadId`, `workspaceId`, and `receivedAt` columns. No schema changes needed for follow-up detection.

---

## Scheduling & Sending

### New Workspace Columns

Add to `workspaces` table via Drizzle migration:

- `briefEnabled` — boolean, default `true`
- `briefHour` — integer (0-23), default `7`
- `briefTimezone` — text, default `'America/Chicago'`
- `lastBriefSentAt` — timestamp, nullable

### Brief Job Flow

1. **Scheduler tick** — runs every 15 minutes via the existing in-process worker
2. **For each workspace** where `briefEnabled = true`:
   - Calculate local time using `briefTimezone`
   - If local hour >= `briefHour` AND `lastBriefSentAt` is null or before today (in local time): workspace is due
3. **For each due workspace:**
   a. Query unread messages (last 24h)
   b. Query awaiting-reply threads
   c. Query stale follow-ups
   d. Call Groq AI (8b model) to categorize/prioritize unread messages
   e. Call Groq AI (70b model) to generate brief summary text
   f. Render HTML email from template
   g. Send via Nodemailer
   h. Update `lastBriefSentAt` on workspace

### Sending

- **Transport:** Nodemailer with SMTP credentials
- **SMTP config:** Environment variables `BRIEF_SMTP_HOST`, `BRIEF_SMTP_PORT`, `BRIEF_SMTP_USER`, `BRIEF_SMTP_PASS`, `BRIEF_FROM_EMAIL`, `BRIEF_FROM_NAME`
- **Fallback:** If SMTP not configured, log brief to console (dev mode)
- **Rate limit:** Max 1 brief per workspace per 12 hours

### Error Handling

- If Groq AI fails: send brief without AI summaries (just raw subject lines + sender names)
- If SMTP fails: log error, do NOT update `lastBriefSentAt` (will retry next tick)
- If workspace has no messages: skip, don't send empty brief

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/brief/queries.ts` | Create: SQL queries for priority items, awaiting-reply, stale follow-ups |
| `src/lib/brief/generate.ts` | Create: Orchestrate data gathering + AI summarization → BriefData |
| `src/lib/brief/email-template.ts` | Create: Render BriefData → HTML email string |
| `src/lib/brief/scheduler.ts` | Create: Check which workspaces are due, trigger brief generation + send |
| `src/lib/brief/send.ts` | Create: Nodemailer send function |
| `src/lib/db/schema.ts` | Modify: Add briefEnabled, briefHour, briefTimezone, lastBriefSentAt to workspaces |
| `src/lib/queue/worker.ts` | Modify: Register brief scheduler on startup interval |
| `src/lib/ai/client.ts` | No change: Reuse existing Groq client |
| `src/lib/stripe/plans.ts` | No change: Use existing `hasAI()` for Pro gating |

---

## Settings UI

Add a "Brief" section in Settings (or the existing Notifications tab):

- Toggle: "Send me a morning brief" (on/off)
- Dropdown: Delivery time (6am - 10am, 1-hour increments)
- Timezone auto-detected from browser, editable
- Pro users: Toggle for "Afternoon recap" (sends second brief at 3pm)
- "Send test brief" button — immediately generates and sends one

---

## Migration Plan

### Drizzle Migration

```typescript
// Add to workspaces table
briefEnabled: boolean('brief_enabled').default(true),
briefHour: integer('brief_hour').default(7),
briefTimezone: text('brief_timezone').default('America/Chicago'),
lastBriefSentAt: timestamp('last_brief_sent_at'),
```

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `BRIEF_SMTP_HOST` | SMTP server hostname | Yes (for sending) |
| `BRIEF_SMTP_PORT` | SMTP port (465 or 587) | Yes |
| `BRIEF_SMTP_USER` | SMTP username | Yes |
| `BRIEF_SMTP_PASS` | SMTP password | Yes |
| `BRIEF_FROM_EMAIL` | Sender address | Yes |
| `BRIEF_FROM_NAME` | Sender display name (default: "InboxGPT") | No |

---

## Success Criteria

1. Free user signs up, connects Gmail → next morning receives a brief email with top 5 priority items
2. Brief email renders correctly in Gmail, Outlook, Apple Mail
3. Free user sees "3 emails waiting on you — Upgrade to Pro" teaser in the brief
4. Pro user sees full awaiting-reply and follow-up sections
5. User can disable brief or change delivery time in Settings
6. Brief skips if no new messages in the last 24 hours
7. Brief works with all email providers (Gmail OAuth, Outlook OAuth, IMAP)
