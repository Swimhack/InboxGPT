import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function POST() {
  const session = await getSession();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email;

  // Resolve the real DB user by email — JWT user ID may be stale after
  // database migration (e.g. SQLite → Supabase Postgres).
  let dbUser = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
    columns: { id: true },
  });

  if (!dbUser) {
    // User exists in JWT but not in DB — create the DB record
    const id = crypto.randomUUID();
    const [created] = await db
      .insert(schema.users)
      .values({
        id,
        email,
        name: session.user.name || email.split('@')[0],
        passwordHash: '',
      })
      .returning({ id: schema.users.id });
    dbUser = created;
  }

  const userId = dbUser.id;

  // Check if user already has a workspace
  const existing = await db
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId))
    .limit(1);

  if (existing[0]) {
    return NextResponse.json({ workspaceId: existing[0].workspaceId });
  }

  // Create workspace
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
