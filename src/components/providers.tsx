'use client';

import { SessionProvider } from 'next-auth/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/inbox/api/auth">
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </SessionProvider>
  );
}
