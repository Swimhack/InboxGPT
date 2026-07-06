import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Must be logged in to access onboarding
  if (!session?.user) {
    redirect('/login');
  }

  // Returning users with accounts skip onboarding
  const accounts = await db.query.channelAccounts.findMany({
    where: eq(schema.channelAccounts.userId, session.user.id),
    columns: { id: true },
  });

  if (accounts.length > 0) {
    // Auto-complete onboarding if not already done
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, session.user.id),
      columns: { onboardingCompletedAt: true },
    });
    if (!user?.onboardingCompletedAt) {
      await db
        .update(schema.users)
        .set({ onboardingCompletedAt: new Date() })
        .where(eq(schema.users.id, session.user.id));
    }
    redirect('/inbox');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Progress bar at top */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: '0%' }}
          id="onboarding-progress"
        />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
