import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
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
