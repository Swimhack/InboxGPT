import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function POST() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  // Check if user already has a workspace
  const existing = await db
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId))
    .limit(1);

  if (existing[0]) {
    return NextResponse.json({ workspaceId: existing[0].workspaceId });
  }

  // Create workspace with slug derived from user email
  const email = session.user.email || 'user';
  const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30)
    + '-' + Date.now().toString(36);
  const name = session.user.name
    ? `${session.user.name}'s Inbox`
    : 'My Inbox';

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ slug, name })
    .returning({ id: schema.workspaces.id });

  await db.insert(schema.workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: 'owner',
  });

  return NextResponse.json({ workspaceId: workspace.id });
}
