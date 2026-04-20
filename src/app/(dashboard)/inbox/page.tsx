'use client';

import { useState, useCallback } from 'react';
import { EmailList } from '@/components/inbox/email-list';
import { EmailDisplay } from '@/components/inbox/email-display';
import { AIBrief } from '@/components/dashboard/ai-brief';

export default function InboxPage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectEmail = useCallback((emailId: string) => {
    setSelectedEmailId(emailId);
  }, []);

  const handleEmailUpdated = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <AIBrief onSelectEmail={handleSelectEmail} />
      <div className="flex flex-1 min-h-0">
      <div className="w-96 border-r flex flex-col">
        <EmailList
          key={refreshKey}
          onSelectEmail={handleSelectEmail}
          selectedEmailId={selectedEmailId}
        />
      </div>
      <div className="flex-1">
        <EmailDisplay
          emailId={selectedEmailId}
          onEmailUpdated={handleEmailUpdated}
        />
      </div>
      </div>
    </div>
  );
}
