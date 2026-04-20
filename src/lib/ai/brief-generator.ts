/**
 * AI Brief Generator — builds a personalized daily inbox brief.
 *
 * Queries recent unread messages, builds a prompt, calls the AI client,
 * and returns a structured BriefContent object.
 */

import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';

export interface BriefContent {
  greeting: string;
  summary: string;
  actionItems: Array<{
    text: string;
    messageId: string;
    priority: 'urgent' | 'high' | 'normal';
  }>;
  highlights: Array<{
    text: string;
    type: 'info' | 'alert';
  }>;
  stats: {
    unreadCount: number;
    totalToday: number;
    topSenders: string[];
  };
  generatedAt: string;
}

interface EmailForBrief {
  id: string;
  subject: string | null;
  snippet: string | null;
  fromIdentity: unknown;
  aiPriority: string | null;
  receivedAt: Date;
  isRead: boolean;
}

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function extractSender(fromIdentity: unknown): string {
  const fi = fromIdentity as { display?: string; value?: string } | null;
  return fi?.display || fi?.value || 'Unknown';
}

export function buildPrompt(userName: string, emails: EmailForBrief[]): string {
  const now = new Date().toISOString();
  const emailList = emails
    .map((e, i) => {
      const sender = extractSender(e.fromIdentity);
      const snippet = (e.snippet || '').slice(0, 150);
      return `${i + 1}. From: ${sender}\n   Subject: ${e.subject || '(No Subject)'}\n   Snippet: ${snippet}\n   Priority: ${e.aiPriority || 'unknown'}\n   Read: ${e.isRead ? 'yes' : 'no'}\n   ID: ${e.id}`;
    })
    .join('\n\n');

  return `You are an executive assistant analyzing an inbox for ${userName}.
Current time: ${now}

Here are the ${emails.length} most recent emails:

${emailList}

Respond with ONLY valid JSON (no markdown, no code fences) in this exact shape:
{
  "greeting": "${getTimeOfDayGreeting()}, ${userName.split(' ')[0] || userName}",
  "summary": "2-3 sentence overview of what needs attention today",
  "actionItems": [
    { "text": "brief action description", "messageId": "uuid from above", "priority": "urgent|high|normal" }
  ],
  "highlights": [
    { "text": "notable pattern or insight", "type": "info|alert" }
  ]
}

Rules:
- actionItems: up to 5 emails needing response/action, most urgent first
- highlights: 2-3 patterns (e.g. "3 emails from same sender", "overdue reply")
- Be concise and actionable
- Use the exact message IDs from above`;
}

export function parseBriefResponse(
  raw: string,
  stats: BriefContent['stats']
): BriefContent {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      greeting: typeof parsed.greeting === 'string' ? parsed.greeting : `${getTimeOfDayGreeting()}`,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Your inbox is ready.',
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems.slice(0, 5).map((item: any) => ({
            text: String(item.text || ''),
            messageId: String(item.messageId || ''),
            priority: ['urgent', 'high', 'normal'].includes(item.priority) ? item.priority : 'normal',
          }))
        : [],
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.slice(0, 3).map((h: any) => ({
            text: String(h.text || ''),
            type: h.type === 'alert' ? 'alert' : 'info',
          }))
        : [],
      stats,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    // AI returned invalid JSON — return a graceful fallback
    return {
      greeting: `${getTimeOfDayGreeting()}`,
      summary: 'Your inbox is ready. Check your recent messages below.',
      actionItems: [],
      highlights: [],
      stats,
      generatedAt: new Date().toISOString(),
    };
  }
}

export function buildStatsBrief(
  userName: string,
  stats: BriefContent['stats']
): BriefContent {
  const greeting = `${getTimeOfDayGreeting()}, ${userName.split(' ')[0] || userName}`;
  const parts: string[] = [];
  if (stats.unreadCount > 0) parts.push(`You have ${stats.unreadCount} unread email${stats.unreadCount > 1 ? 's' : ''}.`);
  if (stats.totalToday > 0) parts.push(`${stats.totalToday} arrived today.`);
  if (stats.topSenders.length > 0) parts.push(`Top sender: ${stats.topSenders[0]}.`);

  return {
    greeting,
    summary: parts.length > 0 ? parts.join(' ') : 'Your inbox is all caught up.',
    actionItems: [],
    highlights: [],
    stats,
    generatedAt: new Date().toISOString(),
  };
}

export async function gatherBriefData(workspaceId: string): Promise<{
  emails: EmailForBrief[];
  stats: BriefContent['stats'];
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const recentEmails = await db
    .select({
      id: schema.messages.id,
      subject: schema.messages.subject,
      snippet: schema.messages.snippet,
      fromIdentity: schema.messages.fromIdentity,
      aiPriority: schema.messages.aiPriority,
      receivedAt: schema.messages.receivedAt,
      isRead: schema.messages.isRead,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.workspaceId, workspaceId),
        eq(schema.messages.isDeleted, false)
      )
    )
    .orderBy(desc(schema.messages.receivedAt))
    .limit(20);

  const unreadCount = recentEmails.filter((e) => !e.isRead).length;
  const todayCount = recentEmails.filter((e) => e.receivedAt >= today).length;

  // Top senders
  const senderCounts: Record<string, number> = {};
  for (const e of recentEmails) {
    const sender = extractSender(e.fromIdentity);
    senderCounts[sender] = (senderCounts[sender] || 0) + 1;
  }
  const topSenders = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return {
    emails: recentEmails,
    stats: { unreadCount, totalToday: todayCount, topSenders },
  };
}
