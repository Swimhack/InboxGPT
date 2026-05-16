'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpgradeBannerProps {
  message: string;
}

export function UpgradeBanner({ message }: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      window.location.href = '/pricing';
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-200">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="default" onClick={handleUpgrade} disabled={loading}>
          Upgrade to Pro
        </Button>
        <button onClick={() => setDismissed(true)} className="text-amber-600 hover:text-amber-800">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
