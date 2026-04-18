'use client';

import { useState, useCallback, useEffect } from 'react';
import { EmailList } from '@/components/inbox/email-list';
import { EmailDisplay } from '@/components/inbox/email-display';
import { SetupWizard } from '@/components/accounts/setup-wizard';
import { AIBrief } from '@/components/inbox/ai-brief';
import { apiUrl } from '@/lib/utils';

export default function InboxPage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null); // null = loading

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

  // Loading state
  if (hasAccounts === null) {
    return (
      <div className='flex h-full items-center justify-center'>
        <div className='flex gap-1.5'>
          {[0,1,2].map((i) => (
            <div key={i} className='w-2 h-2 rounded-full bg-blue-300 animate-bounce' style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // No accounts — show full-screen wizard
  if (!hasAccounts) {
    return <SetupWizard onComplete={handleWizardComplete} />;
  }

  return (
    <div className='flex h-full'>
      <div className='w-96 border-r flex flex-col'>
        <AIBrief />
        <EmailList
          key={refreshKey}
          onSelectEmail={handleSelectEmail}
          selectedEmailId={selectedEmailId}
        />
      </div>
      <div className='flex-1'>
        <EmailDisplay
          emailId={selectedEmailId}
          onEmailUpdated={handleEmailUpdated}
        />
      </div>
    </div>
  );
}
