'use client';

import { useState, useCallback, use } from 'react';
import { EmailList } from '@/components/inbox/email-list';
import { EmailDisplay } from '@/components/inbox/email-display';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const { category } = use(params);
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
      <div className={`${selectedEmailId ? 'hidden md:flex' : 'flex'} w-full md:w-96 border-r flex-col`}>
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
