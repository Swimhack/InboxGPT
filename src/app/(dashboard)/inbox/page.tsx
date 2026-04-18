'use client';

import { useState, useCallback, useEffect } from 'react';
import { EmailList } from '@/components/inbox/email-list';
import { EmailDisplay } from '@/components/inbox/email-display';
import { SetupWizard } from '@/components/accounts/setup-wizard';
import { AIBrief } from '@/components/inbox/ai-brief';
import { apiUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function InboxPage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);

  const checkAccounts = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/accounts'));
      if (res.ok) {
        const data = await res.json();
        setHasAccounts((data.accounts?.length ?? 0) > 0);
      } else {
        setHasAccounts(false);
      }
    } catch {
      setHasAccounts(false);
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

  const handleWizardComplete = useCallback(() => {
    setHasAccounts(true);
    setRefreshKey((prev) => prev + 1);
  }, []);

  if (hasAccounts === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!hasAccounts) {
    return <SetupWizard onComplete={handleWizardComplete} />;
  }

  return (
    <div className="flex h-full">
      {/* Email list — full width on mobile, fixed width on desktop */}
      <div className={`${selectedEmailId ? 'hidden md:flex' : 'flex'} w-full md:w-96 border-r flex-col`}>
        <AIBrief />
        <EmailList
          key={refreshKey}
          onSelectEmail={handleSelectEmail}
          selectedEmailId={selectedEmailId}
        />
      </div>

      {/* Email display — full width on mobile, flex on desktop */}
      <div className={`${selectedEmailId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {/* Mobile back button */}
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
