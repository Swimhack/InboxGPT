import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = await db.query.emails.findFirst({
    where: and(eq(schema.emails.id, params.id), eq(schema.emails.userId, session.user.id)),
    with: {
      attachments: true,
      account: {
        columns: {
          email: true,
          displayName: true,
        },
      },
    },
  });

  if (!email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 });
  }

  // Mark as read
  if (!email.isRead) {
    await db
      .update(schema.emails)
      .set({ isRead: true, updatedAt: new Date() })
      .where(eq(schema.emails.id, params.id));
  }

  return NextResponse.json({ email });
}

const updateSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  folder: z.string().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates = updateSchema.parse(body);

    // Verify ownership
    const email = await db.query.emails.findFirst({
      where: and(eq(schema.emails.id, params.id), eq(schema.emails.userId, session.user.id)),
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    await db
      .update(schema.emails)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.emails.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify ownership
  const email = await db.query.emails.findFirst({
    where: and(eq(schema.emails.id, params.id), eq(schema.emails.userId, session.user.id)),
  });

  if (!email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 });
  }

  // Soft delete by marking as deleted
  await db
    .update(schema.emails)
    .set({ isDeleted: true, folder: 'trash', updatedAt: new Date() })
    .where(eq(schema.emails.id, params.id));

  return NextResponse.json({ success: true });
}
