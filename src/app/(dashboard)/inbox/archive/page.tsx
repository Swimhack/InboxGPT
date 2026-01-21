'use client';

import { useState, useCallback } from 'react';
import { EmailList } from '@/components/inbox/email-list';
import { EmailDisplay } from '@/components/inbox/email-display';

export default function ArchivePage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectEmail = useCallback((emailId: string) => {
    setSelectedEmailId(emailId);
  }, []);

  const handleEmailUpdated = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="flex h-full">
      <div className="w-96 border-r flex flex-col">
        <EmailList
          key={refreshKey}
          folder="archive"
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
  );
}
