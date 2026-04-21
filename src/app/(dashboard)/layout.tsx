import { requireAuth } from '@/lib/auth/session';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
