'use client';

import { useState, useCallback, useEffect } from 'react';
import { EmailList } from '@/components/inbox/email-list';
import { EmailDisplay } from '@/components/inbox/email-display';
import { AIBrief } from '@/components/inbox/ai-brief';
import { apiUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import Link from 'next/link';

export default function InboxPage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasAccounts, setHasAccounts] = useState<boolean>(true); // default true so inbox always shows
  const [plan, setPlan] = useState<string>('free');

  const checkAccounts = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/accounts'));
      if (res.ok) {
        const data = await res.json();
        setHasAccounts((data.accounts?.length ?? 0) > 0);
        if (data.plan) setPlan(data.plan);
      }
    } catch {
      // ignore — just show inbox
    }
  }, []);

  useEffect(() => {
    checkAccounts();
  }, [checkAccounts]);

  const handleSelectEmail = useCallback((emailId: string) => {
    setSelectedEmailId(emailId);
  }, []);

  const handleEmailUpdated = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="flex h-full">
      {/* Email list — full width on mobile, fixed width on desktop */}
      <div className={`${selectedEmailId ? 'hidden md:flex' : 'flex'} w-full md:w-96 border-r flex-col`}>
        {/* Banner if no accounts connected */}
        {!hasAccounts && (
          <div className="p-3 border-b bg-amber-50 dark:bg-amber-950/30">
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">No email accounts connected yet.</p>
            <Button size="sm" asChild>
              <Link href="/accounts">
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                Connect Account
              </Link>
            </Button>
          </div>
        )}
        <AIBrief plan={plan} />
        <EmailList
          key={refreshKey}
          onSelectEmail={handleSelectEmail}
          selectedEmailId={selectedEmailId}
        />
      </div>

      {/* Email display — full width on mobile, flex on desktop */}
      <div className={`${selectedEmailId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {selectedEmailId && (
          <div className="md:hidden p-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEmailId(null)}
              aria-label="Back to email list"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
        )}
        <EmailDisplay
          emailId={selectedEmailId}
          onEmailUpdated={handleEmailUpdated}
        />
      </div>
    </div>
  );
}
