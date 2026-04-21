'use client';

import { useState, useCallback } from 'react';
import { EmailList } from '@/components/inbox/email-list';
import { EmailDisplay } from '@/components/inbox/email-display';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

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
      <div className={`${selectedEmailId ? 'hidden md:flex' : 'flex'} w-full md:w-96 border-r flex-col`}>
        <EmailList
          key={refreshKey}
          folder="archive"
          onSelectEmail={handleSelectEmail}
          selectedEmailId={selectedEmailId}
        />
      </div>
      <div className={`${selectedEmailId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {selectedEmailId && (
          <div className="md:hidden p-2 border-b">
            <Button variant="ghost" size="sm" onClick={() => setSelectedEmailId(null)} aria-label="Back to email list">
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
