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
  const isPro = hasAI(plan, userEmail);
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
