# Killer Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily email digest that sends users their inbox summary every morning — with priority items, awaiting-reply detection, and follow-up reminders.

**Architecture:** New `src/lib/brief/` module with 5 focused files: queries (SQL), generate (orchestration), email-template (HTML rendering), send (Nodemailer), scheduler (cron loop). Hooks into the existing worker startup. Schema migration adds 4 columns to workspaces table.

**Tech Stack:** Drizzle ORM (Postgres), Groq via existing AI client, Nodemailer (already in deps), inline-CSS HTML email template

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/brief/queries.ts` | Create: Raw SQL queries for unread, awaiting-reply, stale follow-ups |
| `src/lib/brief/generate.ts` | Create: Gather data + call AI + assemble BriefData object |
| `src/lib/brief/email-template.ts` | Create: Render BriefData → HTML email string |
| `src/lib/brief/send.ts` | Create: Nodemailer transport + send function |
| `src/lib/brief/scheduler.ts` | Create: Check due workspaces, orchestrate generate→send |
| `src/lib/db/schema.ts` | Modify: Add 4 brief columns to workspaces table |
| `src/lib/queue/worker.ts` | Modify: Start brief scheduler interval on worker start |
| `src/app/api/brief/send-test/route.ts` | Create: POST endpoint to trigger immediate brief for current user |

---

### Task 1: Schema Migration — Add Brief Columns to Workspaces

**Files:**
- Modify: `src/lib/db/schema.ts:161-178`

- [ ] **Step 1: Add 4 columns to workspaces table**

In `src/lib/db/schema.ts`, inside the `workspaces = pgTable(...)` definition, add these columns after `updatedAt`:

```typescript
  briefEnabled: boolean('brief_enabled').notNull().default(true),
  briefHour: integer('brief_hour').notNull().default(7),
  briefTimezone: text('brief_timezone').notNull().default('America/Chicago'),
  lastBriefSentAt: timestamp('last_brief_sent_at', { withTimezone: true, mode: 'date' }),
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:\Users\james\Desktop\RANDOM\AI\InboxGPT && npx tsc --noEmit 2>&1 | grep schema | head -5`

Expected: No new errors.

- [ ] **Step 3: Push schema to database**

Run on server: `cd /home/james/InboxGPT && npx drizzle-kit push`

This adds the columns to the existing table without data loss.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: add brief settings columns to workspaces table"
```

---

### Task 2: Brief Queries

**Files:**
- Create: `src/lib/brief/queries.ts`

- [ ] **Step 1: Create queries file**

```typescript
import { db, schema } from '@/lib/db';
import { eq, sql, and, gt, lt, isNull, desc } from 'drizzle-orm';

export interface BriefEmail {
  id: string;
  subject: string | null;
  snippet: string | null;
  fromName: string;
  fromEmail: string;
  receivedAt: Date;
  threadId: string | null;
  aiSummary: string | null;
  aiCategory: string | null;
  aiPriority: string | null;
}

export interface StaleFollowUp {
  id: string;
  subject: string | null;
  recipientName: string;
  recipientEmail: string;
  sentAt: Date;
  daysSinceSent: number;
}

export interface AwaitingReply {
  id: string;
  subject: string | null;
  fromName: string;
  fromEmail: string;
  receivedAt: Date;
  hoursSinceReceived: number;
}

/**
 * Get unread inbound messages from the last 24 hours, ordered by AI priority
 */
export async function getUnreadMessages(workspaceId: string, limit: number): Promise<BriefEmail[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: schema.messages.id,
      subject: schema.messages.subject,
      snippet: schema.messages.snippet,
      fromIdentity: schema.messages.fromIdentity,
      receivedAt: schema.messages.receivedAt,
      threadId: schema.messages.threadId,
      aiSummary: schema.messages.aiSummary,
      aiCategory: schema.messages.aiCategory,
      aiPriority: schema.messages.aiPriority,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.direction, 'inbound'),
        eq(schema.messages.isRead, false),
        eq(schema.messages.isDeleted, false),
        gt(schema.messages.receivedAt, since),
      )
    )
    .orderBy(desc(schema.messages.receivedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    snippet: r.snippet,
    fromName: (r.fromIdentity as any)?.display || (r.fromIdentity as any)?.value || 'Unknown',
    fromEmail: (r.fromIdentity as any)?.value || '',
    receivedAt: r.receivedAt,
    threadId: r.threadId,
    aiSummary: r.aiSummary,
    aiCategory: r.aiCategory,
    aiPriority: r.aiPriority,
  }));
}

/**
 * Find inbound messages where the user hasn't replied in 24h+
 */
export async function getAwaitingReply(workspaceId: string, limit: number): Promise<AwaitingReply[]> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cutoff14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT m.id, m.subject, m.from_identity, m.received_at, m.thread_id
    FROM messages m
    WHERE m.workspace_id = ${workspaceId}
      AND m.direction = 'inbound'
      AND m.is_deleted = false
      AND m.received_at < ${cutoff24h.toISOString()}
      AND m.received_at > ${cutoff14d.toISOString()}
      AND m.thread_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM messages r
        WHERE r.thread_id = m.thread_id
          AND r.workspace_id = ${workspaceId}
          AND r.direction = 'outbound'
          AND r.received_at > m.received_at
      )
    ORDER BY m.received_at DESC
    LIMIT ${limit}
  `);

  return (rows.rows as any[]).map((r) => {
    const from = typeof r.from_identity === 'string' ? JSON.parse(r.from_identity) : r.from_identity;
    const receivedAt = new Date(r.received_at);
    return {
      id: r.id,
      subject: r.subject,
      fromName: from?.display || from?.value || 'Unknown',
      fromEmail: from?.value || '',
      receivedAt,
      hoursSinceReceived: Math.floor((Date.now() - receivedAt.getTime()) / (1000 * 60 * 60)),
    };
  });
}

/**
 * Find outbound messages sent 3+ days ago with no inbound reply
 */
export async function getStaleFollowUps(workspaceId: string, limit: number): Promise<StaleFollowUp[]> {
  const cutoff3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT m.id, m.subject, m.to_identities, m.received_at, m.thread_id
    FROM messages m
    WHERE m.workspace_id = ${workspaceId}
      AND m.direction = 'outbound'
      AND m.is_deleted = false
      AND m.received_at < ${cutoff3d.toISOString()}
      AND m.received_at > ${cutoff30d.toISOString()}
      AND m.thread_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM messages r
        WHERE r.thread_id = m.thread_id
          AND r.workspace_id = ${workspaceId}
          AND r.direction = 'inbound'
          AND r.received_at > m.received_at
      )
    ORDER BY m.received_at DESC
    LIMIT ${limit}
  `);

  return (rows.rows as any[]).map((r) => {
    const to = typeof r.to_identities === 'string' ? JSON.parse(r.to_identities) : r.to_identities;
    const first = Array.isArray(to) ? to[0] : to;
    const sentAt = new Date(r.received_at);
    return {
      id: r.id,
      subject: r.subject,
      recipientName: first?.display || first?.value || 'Unknown',
      recipientEmail: first?.value || '',
      sentAt,
      daysSinceSent: Math.floor((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24)),
    };
  });
}

/**
 * Get total unread count for the workspace
 */
export async function getUnreadCount(workspaceId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.direction, 'inbound'),
        eq(schema.messages.isRead, false),
        eq(schema.messages.isDeleted, false),
      )
    );
  return result?.count || 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brief/queries.ts
git commit -m "feat: add brief data queries (unread, awaiting-reply, follow-ups)"
```

---

### Task 3: Brief Data Generation

**Files:**
- Create: `src/lib/brief/generate.ts`

- [ ] **Step 1: Create the brief generator**

```typescript
import { getUnreadMessages, getAwaitingReply, getStaleFollowUps, getUnreadCount } from './queries';
import type { BriefEmail, AwaitingReply, StaleFollowUp } from './queries';
import { getAIClient } from '@/lib/ai/client';
import { hasAI } from '@/lib/stripe/plans';

export interface BriefData {
  userName: string;
  date: string;
  stats: {
    newEmails: number;
    needsReply: number;
    staleFollowUps: number;
    totalUnread: number;
  };
  priorityItems: Array<{
    subject: string;
    fromName: string;
    summary: string;
    priority: string;
  }>;
  awaitingReply: Array<{
    subject: string;
    fromName: string;
    hoursSince: number;
  }>;
  followUps: Array<{
    subject: string;
    recipientName: string;
    daysSince: number;
  }>;
  digest: Array<{
    subject: string;
    fromName: string;
    snippet: string;
  }>;
  plan: string;
}

export async function generateBrief(
  workspaceId: string,
  userEmail: string,
  userName: string,
  plan: string,
): Promise<BriefData | null> {
  const isPro = hasAI(plan);
  const itemLimit = isPro ? 20 : 5;

  // Gather data in parallel
  const [unread, awaiting, followUps, totalUnread] = await Promise.all([
    getUnreadMessages(workspaceId, itemLimit),
    isPro ? getAwaitingReply(workspaceId, 10) : getAwaitingReply(workspaceId, 10), // fetch count for free too
    isPro ? getStaleFollowUps(workspaceId, 10) : getStaleFollowUps(workspaceId, 10),
    getUnreadCount(workspaceId),
  ]);

  // Skip if nothing to report
  if (unread.length === 0 && awaiting.length === 0 && followUps.length === 0) {
    return null;
  }

  // Try AI summarization for priority items
  let priorityItems: BriefData['priorityItems'] = [];
  try {
    const ai = getAIClient();
    // Summarize top emails that don't already have AI summaries
    for (const email of unread.slice(0, itemLimit)) {
      if (email.aiSummary) {
        priorityItems.push({
          subject: email.subject || '(no subject)',
          fromName: email.fromName,
          summary: email.aiSummary,
          priority: email.aiPriority || 'normal',
        });
      } else {
        try {
          const result = await ai.summarize(
            email.subject || '',
            email.snippet || '',
          );
          priorityItems.push({
            subject: email.subject || '(no subject)',
            fromName: email.fromName,
            summary: result.summary,
            priority: result.priority,
          });
        } catch {
          // AI failed — use snippet as fallback
          priorityItems.push({
            subject: email.subject || '(no subject)',
            fromName: email.fromName,
            summary: email.snippet?.slice(0, 120) || '',
            priority: 'normal',
          });
        }
      }
    }
  } catch {
    // AI entirely unavailable — use raw data
    priorityItems = unread.slice(0, itemLimit).map((e) => ({
      subject: e.subject || '(no subject)',
      fromName: e.fromName,
      summary: e.snippet?.slice(0, 120) || '',
      priority: e.aiPriority || 'normal',
    }));
  }

  // Sort by priority: urgent > high > normal > low
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  priorityItems.sort((a, b) =>
    (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2) -
    (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2)
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return {
    userName: userName || userEmail.split('@')[0],
    date: dateStr,
    stats: {
      newEmails: unread.length,
      needsReply: awaiting.length,
      staleFollowUps: followUps.length,
      totalUnread,
    },
    priorityItems,
    awaitingReply: isPro
      ? awaiting.map((a) => ({
          subject: a.subject || '(no subject)',
          fromName: a.fromName,
          hoursSince: a.hoursSinceReceived,
        }))
      : [], // Free users get count only (in template)
    followUps: isPro
      ? followUps.map((f) => ({
          subject: f.subject || '(no subject)',
          recipientName: f.recipientName,
          daysSince: f.daysSinceSent,
        }))
      : [],
    digest: unread.slice(itemLimit, itemLimit + 5).map((e) => ({
      subject: e.subject || '(no subject)',
      fromName: e.fromName,
      snippet: e.snippet?.slice(0, 80) || '',
    })),
    plan,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brief/generate.ts
git commit -m "feat: add brief data generation with AI summarization"
```

---

### Task 4: Email Template

**Files:**
- Create: `src/lib/brief/email-template.ts`

- [ ] **Step 1: Create the HTML email renderer**

```typescript
import type { BriefData } from './generate';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://inboxgpt.stricklandai.com';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#dc2626';
    case 'high': return '#ea580c';
    case 'normal': return '#6b7280';
    case 'low': return '#9ca3af';
    default: return '#6b7280';
  }
}

function renderItem(fromName: string, subject: string, summary: string, borderColor: string): string {
  return `
    <tr><td style="padding:12px 16px;border-left:4px solid ${borderColor};background:#fafafa;margin-bottom:8px;">
      <div style="font-weight:600;font-size:14px;color:#111;">${escapeHtml(fromName)}</div>
      <div style="font-size:13px;color:#374151;margin-top:2px;">${escapeHtml(subject)}</div>
      ${summary ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(summary)}</div>` : ''}
    </td></tr>
    <tr><td style="height:8px;"></td></tr>
  `;
}

export function renderBriefEmail(data: BriefData): { html: string; text: string; subject: string } {
  const isPro = data.plan === 'pro';
  const subject = `Your Morning Brief — ${data.stats.newEmails} new email${data.stats.newEmails !== 1 ? 's' : ''}`;

  // Stats line
  const statsParts: string[] = [];
  statsParts.push(`${data.stats.newEmails} new email${data.stats.newEmails !== 1 ? 's' : ''}`);
  if (data.stats.needsReply > 0) statsParts.push(`${data.stats.needsReply} need${data.stats.needsReply !== 1 ? '' : 's'} your reply`);
  if (data.stats.staleFollowUps > 0) statsParts.push(`${data.stats.staleFollowUps} follow-up${data.stats.staleFollowUps !== 1 ? 's' : ''} overdue`);
  const statsLine = statsParts.join(' &middot; ');

  // Priority items
  let priorityHtml = '';
  if (data.priorityItems.length > 0) {
    priorityHtml = `
      <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Priority</td></tr>
      ${data.priorityItems.map((item) =>
        renderItem(item.fromName, item.subject, item.summary, priorityColor(item.priority))
      ).join('')}
    `;
  }

  // Awaiting reply (Pro) or teaser (Free)
  let awaitingHtml = '';
  if (data.stats.needsReply > 0) {
    if (isPro && data.awaitingReply.length > 0) {
      awaitingHtml = `
        <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Awaiting Your Reply</td></tr>
        ${data.awaitingReply.map((item) =>
          renderItem(item.fromName, item.subject, `Waiting ${item.hoursSince}h for your response`, '#eab308')
        ).join('')}
      `;
    } else {
      awaitingHtml = `
        <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Awaiting Your Reply</td></tr>
        <tr><td style="padding:12px 16px;border-left:4px solid #eab308;background:#fefce8;">
          <div style="font-size:13px;color:#854d0e;">${data.stats.needsReply} email${data.stats.needsReply !== 1 ? 's are' : ' is'} waiting on you</div>
          <a href="${BASE_URL}/pricing" style="font-size:12px;color:#7c3aed;text-decoration:underline;margin-top:4px;display:inline-block;">Upgrade to Pro to see them</a>
        </td></tr>
        <tr><td style="height:8px;"></td></tr>
      `;
    }
  }

  // Follow-ups (Pro) or teaser (Free)
  let followUpHtml = '';
  if (data.stats.staleFollowUps > 0) {
    if (isPro && data.followUps.length > 0) {
      followUpHtml = `
        <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Follow-Up Reminders</td></tr>
        ${data.followUps.map((item) =>
          renderItem(item.recipientName, item.subject, `Sent ${item.daysSince} days ago — no reply`, '#3b82f6')
        ).join('')}
      `;
    } else {
      followUpHtml = `
        <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Follow-Up Reminders</td></tr>
        <tr><td style="padding:12px 16px;border-left:4px solid #3b82f6;background:#eff6ff;">
          <div style="font-size:13px;color:#1e40af;">${data.stats.staleFollowUps} sent email${data.stats.staleFollowUps !== 1 ? 's' : ''} got no reply</div>
          <a href="${BASE_URL}/pricing" style="font-size:12px;color:#7c3aed;text-decoration:underline;margin-top:4px;display:inline-block;">Upgrade to Pro for follow-up tracking</a>
        </td></tr>
        <tr><td style="height:8px;"></td></tr>
      `;
    }
  }

  // Digest
  let digestHtml = '';
  if (data.digest.length > 0) {
    digestHtml = `
      <tr><td style="padding:16px 0 8px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;">Also in your inbox</td></tr>
      ${data.digest.map((item) => `
        <tr><td style="padding:6px 16px;">
          <span style="font-weight:600;font-size:13px;color:#374151;">${escapeHtml(item.fromName)}</span>
          <span style="font-size:13px;color:#6b7280;"> — ${escapeHtml(item.subject)}</span>
        </td></tr>
      `).join('')}
    `;
  }

  // Footer
  const footerCta = isPro
    ? `<a href="${BASE_URL}/settings" style="color:#6b7280;text-decoration:underline;">Manage brief settings</a>`
    : `<a href="${BASE_URL}/pricing" style="color:#7c3aed;font-weight:600;text-decoration:underline;">Upgrade to Pro for full brief</a>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1e293b;padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="color:#ffffff;font-size:18px;font-weight:700;">InboxGPT</span></td>
              <td align="right"><span style="color:#94a3b8;font-size:13px;">Your Morning Brief</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- Greeting + Stats -->
        <tr><td style="padding:24px 24px 8px;">
          <div style="font-size:16px;color:#111;font-weight:600;">Good morning${data.userName ? ', ' + escapeHtml(data.userName) : ''}.</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">${data.date} &middot; ${statsLine}</div>
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:0 24px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${priorityHtml}
            ${awaitingHtml}
            ${followUpHtml}
            ${digestHtml}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 24px 24px;" align="center">
          <a href="${BASE_URL}/inbox" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;text-decoration:none;">Open InboxGPT</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;">
            ${footerCta}
            <span style="margin:0 8px;">|</span>
            <a href="${BASE_URL}/settings" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Plain-text fallback
  const textLines = [
    `Good morning${data.userName ? ', ' + data.userName : ''}.`,
    `${data.date} — ${statsParts.join(' · ')}`,
    '',
    '--- PRIORITY ---',
    ...data.priorityItems.map((i) => `• ${i.fromName}: ${i.subject}\n  ${i.summary}`),
    '',
  ];
  if (isPro && data.awaitingReply.length > 0) {
    textLines.push('--- AWAITING YOUR REPLY ---');
    data.awaitingReply.forEach((i) => textLines.push(`• ${i.fromName}: ${i.subject} (${i.hoursSince}h ago)`));
    textLines.push('');
  }
  if (isPro && data.followUps.length > 0) {
    textLines.push('--- FOLLOW-UP REMINDERS ---');
    data.followUps.forEach((i) => textLines.push(`• To ${i.recipientName}: ${i.subject} (${i.daysSince}d ago)`));
    textLines.push('');
  }
  textLines.push(`Open InboxGPT: ${BASE_URL}/inbox`);

  return { html, text: textLines.join('\n'), subject };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brief/email-template.ts
git commit -m "feat: add HTML email template for morning brief"
```

---

### Task 5: Email Sending

**Files:**
- Create: `src/lib/brief/send.ts`

- [ ] **Step 1: Create the Nodemailer send function**

```typescript
import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.BRIEF_SMTP_HOST;
  const port = parseInt(process.env.BRIEF_SMTP_PORT || '465', 10);
  const user = process.env.BRIEF_SMTP_USER;
  const pass = process.env.BRIEF_SMTP_PASS;

  if (!host || !user || !pass) {
    console.log('[Brief] SMTP not configured — briefs will be logged only');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendBriefEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const transport = getTransporter();
  const fromEmail = process.env.BRIEF_FROM_EMAIL || 'brief@inboxgpt.stricklandai.com';
  const fromName = process.env.BRIEF_FROM_NAME || 'InboxGPT';

  if (!transport) {
    console.log(`[Brief] Would send to ${opts.to}: "${opts.subject}" (SMTP not configured)`);
    console.log(`[Brief] Preview:\n${opts.text.slice(0, 500)}`);
    return true; // Don't block — just log
  }

  try {
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    console.log(`[Brief] Sent to ${opts.to}`);
    return true;
  } catch (error) {
    console.error(`[Brief] Failed to send to ${opts.to}:`, error);
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brief/send.ts
git commit -m "feat: add Nodemailer-based brief email sender"
```

---

### Task 6: Brief Scheduler

**Files:**
- Create: `src/lib/brief/scheduler.ts`
- Modify: `src/lib/queue/worker.ts`

- [ ] **Step 1: Create the scheduler**

```typescript
import { db, schema } from '@/lib/db';
import { eq, and, sql, isNull, or, lt } from 'drizzle-orm';
import { generateBrief } from './generate';
import { renderBriefEmail } from './email-template';
import { sendBriefEmail } from './send';

const BRIEF_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes
let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Check if a workspace is due for a brief
 */
function isDue(
  briefHour: number,
  briefTimezone: string,
  lastSentAt: Date | null,
): boolean {
  // Get current time in workspace timezone
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: briefTimezone }));
  const localHour = localTime.getHours();

  // Not yet time
  if (localHour < briefHour) return false;

  // Already sent today?
  if (lastSentAt) {
    const lastSentLocal = new Date(lastSentAt.toLocaleString('en-US', { timeZone: briefTimezone }));
    if (
      lastSentLocal.getFullYear() === localTime.getFullYear() &&
      lastSentLocal.getMonth() === localTime.getMonth() &&
      lastSentLocal.getDate() === localTime.getDate()
    ) {
      return false; // Already sent today
    }
  }

  return true;
}

/**
 * Process briefs for all due workspaces
 */
async function processBriefs(): Promise<void> {
  try {
    // Get all workspaces with brief enabled
    const workspaces = await db
      .select({
        id: schema.workspaces.id,
        name: schema.workspaces.name,
        plan: schema.workspaces.plan,
        briefHour: schema.workspaces.briefHour,
        briefTimezone: schema.workspaces.briefTimezone,
        lastBriefSentAt: schema.workspaces.lastBriefSentAt,
      })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.briefEnabled, true));

    for (const ws of workspaces) {
      if (!isDue(ws.briefHour, ws.briefTimezone, ws.lastBriefSentAt)) {
        continue;
      }

      // Get the workspace owner's email
      const [member] = await db
        .select({
          userId: schema.workspaceMembers.userId,
        })
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, ws.id),
            eq(schema.workspaceMembers.role, 'owner'),
          )
        );

      if (!member) continue;

      const [user] = await db
        .select({ email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, member.userId));

      if (!user?.email) continue;

      try {
        const briefData = await generateBrief(ws.id, user.email, user.name || '', ws.plan);

        if (!briefData) {
          // Nothing to report — still mark as sent so we don't keep retrying
          await db
            .update(schema.workspaces)
            .set({ lastBriefSentAt: new Date() })
            .where(eq(schema.workspaces.id, ws.id));
          continue;
        }

        const email = renderBriefEmail(briefData);
        const sent = await sendBriefEmail({
          to: user.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });

        if (sent) {
          await db
            .update(schema.workspaces)
            .set({ lastBriefSentAt: new Date() })
            .where(eq(schema.workspaces.id, ws.id));
          console.log(`[Brief] Sent brief for workspace ${ws.name} to ${user.email}`);
        }
      } catch (error) {
        console.error(`[Brief] Error processing workspace ${ws.id}:`, error);
        // Don't update lastBriefSentAt — will retry next tick
      }
    }
  } catch (error) {
    console.error('[Brief] Scheduler error:', error);
  }
}

/**
 * Start the brief scheduler
 */
export function startBriefScheduler(): void {
  if (schedulerInterval) return;

  console.log('[Brief] Starting brief scheduler (every 15 minutes)');
  schedulerInterval = setInterval(processBriefs, BRIEF_INTERVAL_MS);

  // Run first check after 30 seconds (let the app warm up)
  setTimeout(processBriefs, 30 * 1000);
}

/**
 * Stop the brief scheduler
 */
export function stopBriefScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
```

- [ ] **Step 2: Hook scheduler into worker startup**

In `src/lib/queue/worker.ts`, add this import at the top:

```typescript
import { startBriefScheduler } from '@/lib/brief/scheduler';
```

Then inside the `startWorker()` function, after `console.log('[Worker] Job worker started');`, add:

```typescript
  // Start the morning brief scheduler
  startBriefScheduler();
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/brief/scheduler.ts src/lib/queue/worker.ts
git commit -m "feat: add brief scheduler — checks every 15min, sends when due"
```

---

### Task 7: Test Brief API Endpoint

**Files:**
- Create: `src/app/api/brief/send-test/route.ts`

- [ ] **Step 1: Create test-send endpoint**

```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { generateBrief } from '@/lib/brief/generate';
import { renderBriefEmail } from '@/lib/brief/email-template';
import { sendBriefEmail } from '@/lib/brief/send';

export async function POST() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: 'No workspace' }, { status: 400 });
  }

  const [ws] = await db
    .select({ plan: schema.workspaces.plan })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.workspaceId));

  const briefData = await generateBrief(
    workspace.workspaceId,
    session.user.email,
    session.user.name || '',
    ws?.plan || 'free',
  );

  if (!briefData) {
    return NextResponse.json({ message: 'No emails to summarize — brief skipped' });
  }

  const email = renderBriefEmail(briefData);
  const sent = await sendBriefEmail({
    to: session.user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (!sent) {
    return NextResponse.json({ error: 'Failed to send — check SMTP config' }, { status: 500 });
  }

  return NextResponse.json({ message: `Brief sent to ${session.user.email}`, data: briefData });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/brief/send-test/route.ts
git commit -m "feat: add POST /api/brief/send-test endpoint for manual brief trigger"
```

---

### Task 8: Deploy & Configure SMTP

**Files:** None (server-side configuration)

- [ ] **Step 1: Push code to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Pull and rebuild on server**

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "cd /home/james/InboxGPT && git pull origin main && rm -rf .next && npx next build"
```

- [ ] **Step 3: Run schema migration**

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "cd /home/james/InboxGPT && npx drizzle-kit push"
```

- [ ] **Step 4: Add SMTP env vars**

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "cat >> /home/james/InboxGPT/.env << 'EOF'

# Brief Email SMTP
BRIEF_SMTP_HOST=smtp.zoho.com
BRIEF_SMTP_PORT=465
BRIEF_SMTP_USER=<zoho-email>
BRIEF_SMTP_PASS=<zoho-password>
BRIEF_FROM_EMAIL=<zoho-email>
BRIEF_FROM_NAME=InboxGPT
EOF"
```

(Replace placeholders with actual Zoho SMTP credentials via the zoho-mail skill)

- [ ] **Step 5: Restart PM2**

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "pm2 restart inboxgpt --update-env"
```

- [ ] **Step 6: Verify scheduler started**

```bash
ssh -i ~/.ssh/fleet_admin_key james@137.184.136.55 "pm2 logs inboxgpt --nostream --lines 10 | grep Brief"
```

Expected: `[Brief] Starting brief scheduler (every 15 minutes)`

- [ ] **Step 7: Test manual brief**

```bash
curl -X POST https://inboxgpt.stricklandai.com/api/brief/send-test \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json"
```

Or test via browser: log in, then hit the endpoint from devtools.

---

## Execution Summary

| Task | What it does | Depends on |
|------|-------------|-----------|
| 1 | Schema migration (4 workspace columns) | — |
| 2 | Brief data queries | — |
| 3 | Brief generation (data + AI) | Task 2 |
| 4 | HTML email template | Task 3 |
| 5 | Nodemailer send function | — |
| 6 | Scheduler + worker integration | Tasks 1, 3, 4, 5 |
| 7 | Test endpoint | Tasks 3, 4, 5 |
| 8 | Deploy & configure SMTP | All |

Tasks 1, 2, 5 are independent and can run in parallel.
Tasks 3, 4 are sequential (3 before 4).
Task 6 depends on 1, 3, 4, 5.
Task 7 depends on 3, 4, 5.
Task 8 depends on all.
