import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

type Params = { params: Promise<{ token: string }> };

/** GET /api/invitations/[token] — validate invite (public, used by accept page) */
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;

  const [invite] = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      role: schema.invitations.role,
      expiresAt: schema.invitations.expiresAt,
      acceptedAt: schema.invitations.acceptedAt,
      workspaceId: schema.invitations.workspaceId,
      workspaceName: schema.workspaces.name,
    })
    .from(schema.invitations)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.invitations.workspaceId))
    .where(eq(schema.invitations.token, token))
    .limit(1);

  if (!invite) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }
  if (invite.acceptedAt) {
    return NextResponse.json({ error: 'Invitation already accepted' }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    workspaceName: invite.workspaceName,
    expiresAt: invite.expiresAt,
  });
}

/** POST /api/invitations/[token]/accept — accept invite (requires auth) */
export async function POST(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [invite] = await db
    .select({
      id: schema.invitations.id,
      workspaceId: schema.invitations.workspaceId,
      role: schema.invitations.role,
      expiresAt: schema.invitations.expiresAt,
      acceptedAt: schema.invitations.acceptedAt,
    })
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))
    .limit(1);

  if (!invite) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }
  if (invite.acceptedAt) {
    return NextResponse.json({ error: 'Invitation already accepted' }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
  }

  const userId = session.user.id as string;

  // Check not already a member
  const [existing] = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, invite.workspaceId),
        eq(schema.workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (!existing) {
    await db.insert(schema.workspaceMembers).values({
      workspaceId: invite.workspaceId,
      userId,
      role: invite.role,
    });
  }

  // Mark accepted
  await db
    .update(schema.invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.invitations.id, invite.id));

  return NextResponse.json({ ok: true, workspaceId: invite.workspaceId });
}
