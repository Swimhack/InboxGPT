'use client';

import { apiUrl } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AddAccountDialog } from './add-account-dialog';
import { UpgradeModal } from '@/components/upgrade/upgrade-modal';
import { Mail, RefreshCw, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Account {
  id: string;
  email: string;
  displayName: string | null;
  providerType: 'gmail' | 'outlook' | 'imap';
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncAt: string | null;
  syncError: string | null;
  isActive: boolean;
}

const providerLabels: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  imap: 'IMAP',
};

export function AccountList() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [syncingAccounts, setSyncingAccounts] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch(apiUrl('/api/accounts'));
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load accounts',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingAccounts((prev) => new Set(prev).add(accountId));

    try {
      const res = await fetch(apiUrl(`/api/accounts/${accountId}/sync`), {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to trigger sync');

      toast({ title: 'Sync started', description: 'Email sync has been triggered' });

      // Poll for sync completion
      const pollInterval = setInterval(async () => {
        const statusRes = await fetch(apiUrl(`/api/accounts/${accountId}`));
        if (statusRes.ok) {
          const data = await statusRes.json();
          if (data.account?.syncStatus !== 'syncing') {
            clearInterval(pollInterval);
            setSyncingAccounts((prev) => {
              const next = new Set(prev);
              next.delete(accountId);
              return next;
            });
            fetchAccounts();
          }
        }
      }, 2000);

      // Stop polling after 60 seconds max
      setTimeout(() => {
        clearInterval(pollInterval);
        setSyncingAccounts((prev) => {
          const next = new Set(prev);
          next.delete(accountId);
          return next;
        });
      }, 60000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start sync',
        variant: 'destructive',
      });
      setSyncingAccounts((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm('Are you sure you want to remove this account? All associated emails will be deleted.')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/accounts/${accountId}`), {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete account');

      setAccounts((prev) => prev.filter((acc) => acc.id !== accountId));
      toast({ title: 'Account removed' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove account',
        variant: 'destructive',
      });
    }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const isSyncing = (accountId: string) => syncingAccounts.has(accountId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div>
                      <Skeleton className="h-5 w-32 mb-1" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Connected Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Manage your email accounts and sync settings
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Mail className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>

      <div className="grid gap-4">
        {accounts.map((account) => (
          <Card key={account.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{account.displayName || account.email}</CardTitle>
                    <CardDescription>{account.email}</CardDescription>
                  </div>
                </div>
                <Badge variant="outline">{providerLabels[account.providerType] || account.providerType}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(account.syncStatus === 'idle' && !isSyncing(account.id)) && (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-muted-foreground">
                        Synced {formatLastSync(account.lastSyncAt)}
                      </span>
                    </>
                  )}
                  {(account.syncStatus === 'syncing' || isSyncing(account.id)) && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm text-muted-foreground">Syncing...</span>
                    </>
                  )}
                  {(account.syncStatus === 'error' && !isSyncing(account.id)) && (
                    <>
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-red-500">
                        {account.syncError || 'Sync failed'}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSync(account.id)}
                    disabled={account.syncStatus === 'syncing' || isSyncing(account.id)}
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-1 ${(account.syncStatus === 'syncing' || isSyncing(account.id)) ? 'animate-spin' : ''}`}
                    />
                    Sync
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(account.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {accounts.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No accounts connected</h3>
              <p className="text-muted-foreground mb-4">
                Add an email account to start receiving and sending emails.
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>Add Account</Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AddAccountDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAccountAdded={fetchAccounts}
        onUpgradeRequired={() => setIsUpgradeModalOpen(true)}
      />

      <UpgradeModal
        open={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        feature="add unlimited email accounts"
      />
    </div>
  );
}
