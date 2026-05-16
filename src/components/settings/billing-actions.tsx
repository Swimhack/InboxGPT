'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, ArrowUpRight } from 'lucide-react';
import type { PlanId } from '@/lib/stripe/plans';

interface BillingActionsProps {
  currentPlan: PlanId;
  hasSubscription: boolean;
}

export function BillingActions({ currentPlan, hasSubscription }: BillingActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (plan: 'pro') => {
    setLoading(plan);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      /* non-critical */
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      /* non-critical */
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {currentPlan === 'free' && (
        <Button onClick={() => handleUpgrade('pro')} disabled={loading !== null}>
          {loading === 'pro' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Upgrade to Pro — $9/mo
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </Button>
      )}

      {hasSubscription && (
        <Button variant="ghost" onClick={handlePortal} disabled={loading !== null}>
          {loading === 'portal' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Manage billing
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
