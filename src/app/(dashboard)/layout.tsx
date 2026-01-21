import { requireAuth } from '@/lib/auth/session';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { StatusBar } from '@/components/dashboard/status-bar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

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
