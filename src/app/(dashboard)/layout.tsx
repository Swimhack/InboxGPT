import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { StatusBar } from '@/components/dashboard/status-bar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id as string),
    columns: { onboardingCompletedAt: true },
  });
  if (!row?.onboardingCompletedAt) {
    redirect('/welcome');
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={user} />
        <StatusBar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
