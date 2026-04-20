import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getWorkspace } from '@/lib/auth/workspace';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { ChannelGrid } from '@/components/onboarding/channel-grid';
import { getProviderAvailability } from '@/lib/channels/availability';
import type { ChannelProvider } from '@/lib/channels/catalog';

export const dynamic = 'force-dynamic';

export default async function ConnectChannelsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const workspace = await getWorkspace();
  if (!workspace) redirect('/welcome');

  const rows = await db
    .select({
      provider: schema.channelAccounts.provider,
      externalAccountId: schema.channelAccounts.externalAccountId,
      displayName: schema.channelAccounts.displayName,
      status: schema.channelAccounts.status,
    })
    .from(schema.channelAccounts)
    .where(eq(schema.channelAccounts.workspaceId, workspace.workspaceId));

  const initialConnections: Partial<Record<ChannelProvider, { count: number; accounts: Array<{ email: string; name: string | null }> }>> = {};
  for (const row of rows) {
    const entry = initialConnections[row.provider] ?? { count: 0, accounts: [] };
    entry.count += 1;
    entry.accounts.push({ email: row.externalAccountId, name: row.displayName ?? null });
    initialConnections[row.provider] = entry;
  }

  const appBaseUrl = process.env.NEXTAUTH_URL || 'https://inboxgpt.fly.dev';
  const availability = getProviderAvailability();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Connect your channels</h1>
        <p className="text-muted-foreground">
          Connect as many as you like. You can add more any time from Settings.
        </p>
      </div>

      <Suspense fallback={null}>
        <ChannelGrid
          initialConnections={initialConnections}
          availability={availability}
          appBaseUrl={appBaseUrl}
        />
      </Suspense>
    </div>
  );
}
