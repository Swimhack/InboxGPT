'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CHANNEL_CATALOG,
  CHANNEL_CATEGORIES,
  type ChannelDef,
  type ChannelProvider,
} from '@/lib/channels/catalog';
import { ChannelCard, type ChannelCardState, type ConnectedAccount } from './channel-card';
import { InstallInstructionsDialog } from './install-instructions-dialog';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddAccountDialog } from '@/components/accounts/add-account-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export type ProviderAvailability = Record<ChannelProvider, { ready: boolean; reason?: string }>;

export type ChannelConnection = { count: number; accounts: ConnectedAccount[] };

interface ChannelGridProps {
  initialConnections: Partial<Record<ChannelProvider, ChannelConnection>>;
  availability: ProviderAvailability;
  appBaseUrl: string;
}

export function ChannelGrid({ initialConnections, availability, appBaseUrl }: ChannelGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [connections, setConnections] =
    useState<Partial<Record<ChannelProvider, ChannelConnection>>>(initialConnections);
  const [busy, setBusy] = useState<ChannelProvider | null>(null);
  const [imapOpen, setImapOpen] = useState(false);
  const [installDialog, setInstallDialog] = useState<ChannelDef | null>(null);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const err = searchParams.get('error');
    if (connected) {
      toast({ title: `${connected} connected`, description: 'Your channel is syncing.' });
      // Refresh connections from server so we get the real email, not just a count bump
      fetch('/api/accounts?groupBy=provider')
        .then((r) => r.json())
        .then((data) => {
          const next: Partial<Record<ChannelProvider, ChannelConnection>> = {};
          for (const [p, list] of Object.entries(data.byProvider ?? {})) {
            const accounts = (list as Array<{ externalAccountId: string; displayName: string | null }>).map(
              (row) => ({ email: row.externalAccountId, name: row.displayName ?? null })
            );
            next[p as ChannelProvider] = { count: accounts.length, accounts };
          }
          setConnections(next);
        })
        .catch(() => {
          setConnections((prev) => {
            const existing = prev[connected as ChannelProvider] ?? { count: 0, accounts: [] };
            return {
              ...prev,
              [connected as ChannelProvider]: { ...existing, count: existing.count + 1 },
            };
          });
        });
      router.replace('/connect-channels');
    } else if (err) {
      toast({
        title: 'Connection failed',
        description: `Error: ${err}. Please try again.`,
        variant: 'destructive',
      });
      router.replace('/connect-channels');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectedCount = useMemo(
    () => Object.values(connections).reduce((a, c) => a + (c?.count ?? 0), 0),
    [connections]
  );

  const handleConnect = (def: ChannelDef) => {
    setBusy(def.id);
    try {
      switch (def.strategy.kind) {
        case 'oauth':
          window.location.href = def.strategy.initiatePath + '?from=/connect-channels';
          return;
        case 'imap-dialog':
          setImapOpen(true);
          break;
        case 'install-doc':
          setInstallDialog(def);
          break;
        case 'coming-soon':
          break;
      }
    } finally {
      if (def.strategy.kind !== 'oauth') setBusy(null);
    }
  };

  const handleImapSuccess = async () => {
    setImapOpen(false);
    const res = await fetch('/api/accounts?groupBy=provider').catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const next: Partial<Record<ChannelProvider, ChannelConnection>> = {};
      for (const [p, list] of Object.entries(data.byProvider ?? {})) {
        const accounts = (list as Array<{ externalAccountId: string; displayName: string | null }>).map(
          (row) => ({ email: row.externalAccountId, name: row.displayName ?? null })
        );
        next[p as ChannelProvider] = { count: accounts.length, accounts };
      }
      setConnections(next);
    }
    toast({ title: 'IMAP account connected' });
  };

  const markCompleteAndGo = async () => {
    setFinishing(true);
    try {
      await fetch('/api/user/onboarding', { method: 'POST' });
      router.push('/complete');
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
      setFinishing(false);
    }
  };

  const handleContinue = () => {
    if (connectedCount === 0) {
      setSkipConfirm(true);
    } else {
      markCompleteAndGo();
    }
  };

  const grouped = useMemo(() => {
    const by: Record<string, ChannelDef[]> = {};
    for (const def of CHANNEL_CATALOG) {
      (by[def.category] ||= []).push(def);
    }
    return by;
  }, []);

  return (
    <div className="space-y-8">
      {CHANNEL_CATEGORIES.map((cat) => {
        const defs = grouped[cat.id] ?? [];
        if (defs.length === 0) return null;
        return (
          <section key={cat.id}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {cat.label}
              </h2>
              <Separator className="flex-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {defs.map((def) => {
                const conn = connections[def.id];
                const avail = availability[def.id];
                // Native coming-soon channels are always coming-soon. Otherwise,
                // downgrade to coming-soon when the server says they're not ready.
                const nativelyComingSoon = def.strategy.kind === 'coming-soon';
                const downgraded = !nativelyComingSoon && !avail.ready;

                let state: ChannelCardState = 'ready';
                if (nativelyComingSoon || downgraded) state = 'coming-soon';
                else if ((conn?.count ?? 0) > 0) state = 'connected';

                const reason =
                  downgraded ? avail.reason : nativelyComingSoon && def.strategy.kind === 'coming-soon'
                    ? def.strategy.reason
                    : undefined;

                return (
                  <ChannelCard
                    key={def.id}
                    def={def}
                    state={state}
                    connectedAccounts={conn?.accounts ?? []}
                    comingSoonReason={reason}
                    busy={busy === def.id}
                    onConnect={handleConnect}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="flex items-center justify-between gap-3 pt-4">
        <Button variant="ghost" onClick={handleContinue} disabled={finishing}>
          Skip for now
        </Button>
        <Button onClick={handleContinue} disabled={finishing}>
          {finishing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>

      <AddAccountDialog open={imapOpen} onOpenChange={setImapOpen} onAccountAdded={handleImapSuccess} />

      <InstallInstructionsDialog
        open={!!installDialog}
        onOpenChange={(open) => !open && setInstallDialog(null)}
        def={installDialog}
        appBaseUrl={appBaseUrl}
      />

      <Dialog open={skipConfirm} onOpenChange={setSkipConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Continue without connecting anything?</DialogTitle>
            <DialogDescription>
              You can connect channels any time from Settings, but your inbox will be empty until
              you do.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipConfirm(false)}>
              Go back
            </Button>
            <Button
              onClick={() => {
                setSkipConfirm(false);
                markCompleteAndGo();
              }}
            >
              Continue anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
