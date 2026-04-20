import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import {
  gatherBriefData,
  buildPrompt,
  parseBriefResponse,
  buildStatsBrief,
  type BriefContent,
} from '@/lib/ai/brief-generator';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) {
    return NextResponse.json({ brief: null });
  }

  const userName = session.user.name || session.user.email || 'there';
  const today = new Date().toISOString().slice(0, 10);

  // Gate: at least 1 active channel account
  const [account] = await db
    .select({ id: schema.channelAccounts.id })
    .from(schema.channelAccounts)
    .where(
      and(
        eq(schema.channelAccounts.workspaceId, workspace.workspaceId),
        eq(schema.channelAccounts.status, 'active')
      )
    )
    .limit(1);

  if (!account) {
    return NextResponse.json({ brief: null, reason: 'no_accounts' });
  }

  // Check cache
  const [cached] = await db
    .select({ content: schema.briefs.content })
    .from(schema.briefs)
    .where(
      and(
        eq(schema.briefs.workspaceId, workspace.workspaceId),
        eq(schema.briefs.briefDate, today)
      )
    );

  if (cached) {
    return NextResponse.json({ brief: cached.content, cached: true });
  }

  // Gather data
  const { emails, stats } = await gatherBriefData(workspace.workspaceId);

  if (emails.length === 0) {
    const brief = buildStatsBrief(userName, stats);
    return NextResponse.json({ brief, cached: false });
  }

  // Check AI availability
  let brief: BriefContent;
  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  const hasRealKey = aiKey && aiKey.length > 10; // not a placeholder empty string

  if (!hasRealKey) {
    // No AI key — return stats-only brief
    brief = buildStatsBrief(userName, stats);
  } else {
    // Generate AI brief
    try {
      const prompt = buildPrompt(userName, emails);
      const { getAIClient } = await import('@/lib/ai/client');
      const client = getAIClient();
      const result = await client.summarize(
        'Daily Inbox Brief',
        prompt
      );
      // The summarize method returns {summary, category, priority} but we
      // hijacked the prompt to return our brief JSON in the summary field.
      // Parse the full response from the summary.
      brief = parseBriefResponse(result.summary, stats);
    } catch (err) {
      console.error('[brief] AI generation failed:', err);
      brief = buildStatsBrief(userName, stats);
    }
  }

  // Cache the brief
  try {
    await db.insert(schema.briefs).values({
      workspaceId: workspace.workspaceId,
      briefDate: today,
      content: brief as unknown as Record<string, unknown>,
    }).onConflictDoNothing();
  } catch {
    // Cache write failed — non-critical
  }

  return NextResponse.json({ brief, cached: false });
}
