import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
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

      // Get the workspace owner's user ID
      const [member] = await db
        .select({
          userId: schema.workspaceMembers.userId,
        })
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, ws.id),
            eq(schema.workspaceMembers.role, 'owner'),
          ),
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
        // If not sent, don't update lastBriefSentAt — will retry next tick
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
