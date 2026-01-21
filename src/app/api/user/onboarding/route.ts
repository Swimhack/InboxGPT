import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function POST() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await db
      .update(schema.users)
      .set({
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update onboarding status:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: {
      onboardingCompletedAt: true,
    },
  });

  return NextResponse.json({
    completed: !!user?.onboardingCompletedAt,
    completedAt: user?.onboardingCompletedAt,
  });
}
