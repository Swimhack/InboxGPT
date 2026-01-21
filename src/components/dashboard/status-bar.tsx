'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface StatusData {
  syncing: boolean;
  aiProcessing: boolean;
  hasErrors: boolean;
  pendingEmails: number;
  lastSync: string | null;
  accounts: Array<{
    id: string;
    email: string;
    status: 'idle' | 'syncing' | 'error';
    lastSync: string | null;
    error: string | null;
  }>;
}

export function StatusBar() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Poll for status updates
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch {
        // Silently fail - status bar is non-critical
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 5 seconds
    const interval = setInterval(fetchStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  // Don't show if no status or everything is idle with no recent activity
  if (!status) return null;

  const { syncing, aiProcessing, hasErrors, pendingEmails, lastSync } = status;

  // Hide if everything is idle and last sync was more than 1 minute ago
  const isIdle = !syncing && !aiProcessing && !hasErrors;
  if (isIdle && !isVisible) return null;

  // Format last sync time
  const lastSyncText = lastSync
    ? `Last synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
    : 'Never synced';

  return (
    <div className="h-8 px-4 bg-muted/50 border-b flex items-center justify-between text-xs">
      <div className="flex items-center gap-4">
        {/* Syncing indicator */}
        {syncing && (
          <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Syncing emails...
          </span>
        )}

        {/* AI Processing indicator */}
        {aiProcessing && !syncing && (
          <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
            <Sparkles className="h-3 w-3 animate-pulse" />
            AI analyzing {pendingEmails > 0 ? `${pendingEmails} emails` : 'emails'}...
          </span>
        )}

        {/* Error indicator */}
        {hasErrors && !syncing && !aiProcessing && (
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            Some accounts have sync errors
          </span>
        )}

        {/* All good indicator */}
        {isIdle && (
          <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            All up to date
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{lastSyncText}</span>
        {isIdle && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setIsVisible(false)}
          >
            Hide
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact status indicator for use in other components
 */
export function StatusIndicator() {
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          setStatus(await res.json());
        }
      } catch {
        // Ignore errors
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  const { syncing, aiProcessing, hasErrors } = status;

  if (syncing) {
    return (
      <div className="flex items-center gap-1 text-blue-600" title="Syncing emails">
        <RefreshCw className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  if (aiProcessing) {
    return (
      <div className="flex items-center gap-1 text-purple-600" title="AI processing">
        <Sparkles className="h-3 w-3 animate-pulse" />
      </div>
    );
  }

  if (hasErrors) {
    return (
      <div className="flex items-center gap-1 text-amber-600" title="Sync errors">
        <AlertCircle className="h-3 w-3" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-green-600" title="All synced">
      <CheckCircle2 className="h-3 w-3" />
    </div>
  );
}
