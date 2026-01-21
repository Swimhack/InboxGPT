import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let session = null;

  try {
    session = await getSession();
  } catch (error) {
    console.error('Session error:', error);
  }

  // Not logged in - go to login
  if (!session?.user) {
    redirect('/login');
  }

  // Check if user has completed onboarding
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: {
      onboardingCompletedAt: true,
    },
  });

  // New user - go to onboarding
  if (!user?.onboardingCompletedAt) {
    // Check if they have any email accounts
    const accountCount = await db.query.emailAccounts.findMany({
      where: eq(schema.emailAccounts.userId, session.user.id),
      columns: { id: true },
    });

    // If they have no accounts, start onboarding from welcome
    if (accountCount.length === 0) {
      redirect('/welcome');
    }

    // If they have accounts but haven't completed onboarding, mark as complete
    await db
      .update(schema.users)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(schema.users.id, session.user.id));
  }

  // Existing user - go to inbox
  redirect('/inbox');
}
