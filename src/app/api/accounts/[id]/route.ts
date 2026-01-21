import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const account = await db.query.emailAccounts.findFirst({
    where: and(
      eq(schema.emailAccounts.id, id),
      eq(schema.emailAccounts.userId, session.user.id)
    ),
    columns: {
      id: true,
      email: true,
      displayName: true,
      providerType: true,
      lastSyncAt: true,
      syncStatus: true,
      syncError: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  return NextResponse.json({ account });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const account = await db.query.emailAccounts.findFirst({
    where: and(
      eq(schema.emailAccounts.id, id),
      eq(schema.emailAccounts.userId, session.user.id)
    ),
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Delete associated emails first
  await db.delete(schema.emails).where(eq(schema.emails.accountId, id));

  // Delete the account
  await db.delete(schema.emailAccounts).where(eq(schema.emailAccounts.id, id));

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const account = await db.query.emailAccounts.findFirst({
    where: and(
      eq(schema.emailAccounts.id, id),
      eq(schema.emailAccounts.userId, session.user.id)
    ),
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const body = await request.json();
  const { displayName, isActive } = body;

  const updates: Partial<typeof schema.emailAccounts.$inferInsert> = {};
  if (displayName !== undefined) updates.displayName = displayName;
  if (isActive !== undefined) updates.isActive = isActive;

  if (Object.keys(updates).length > 0) {
    await db.update(schema.emailAccounts)
      .set(updates)
      .where(eq(schema.emailAccounts.id, id));
  }

  return NextResponse.json({ success: true });
}
