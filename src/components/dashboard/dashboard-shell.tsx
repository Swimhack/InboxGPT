'use client';

import { Sidebar, SidebarProvider } from '@/components/dashboard/sidebar';
import { EcosystemHeader } from '@/components/dashboard/ecosystem-header';
import { StatusBar } from '@/components/dashboard/status-bar';

interface DashboardShellProps {
  user: { id: string; email: string; name: string };
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <EcosystemHeader user={user} />
          <StatusBar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
