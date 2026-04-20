'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { EmailList } from '@/components/inbox/email-list';
import { EmailDisplay } from '@/components/inbox/email-display';

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectEmail = useCallback((emailId: string) => {
    setSelectedEmailId(emailId);
  }, []);

  const handleEmailUpdated = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const categoryName = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <div className="flex h-full">
      <div className="w-96 border-r flex flex-col">
        <div className="p-3 border-b">
          <h2 className="font-medium">{categoryName}</h2>
          <p className="text-sm text-muted-foreground">Emails categorized as {categoryName.toLowerCase()}</p>
        </div>
        <EmailList
          key={refreshKey}
          category={category}
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
