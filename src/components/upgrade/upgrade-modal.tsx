'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  feature: string;
}

export function UpgradeModal({ open, onClose, feature }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!open) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      router.push('/pricing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-xl font-bold">Upgrade to Pro</h2>
        </div>

        <p className="text-muted-foreground mb-6">
          Upgrade to Pro to {feature}. Just $29/month — cancel anytime.
        </p>

        <ul className="space-y-2 mb-6 text-sm">
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Unlimited email accounts
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Unlimited messages
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> AI brief, summaries & suggested replies
          </li>
        </ul>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Not now
          </Button>
          <Button onClick={handleUpgrade} disabled={loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upgrade — $29/mo
          </Button>
        </div>
      </div>
    </div>
  );
}
