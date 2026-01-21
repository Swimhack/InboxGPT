'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn, formatDate, truncate } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, Paperclip, ArrowLeft, Search } from 'lucide-react';
import { EmailDisplay } from '@/components/inbox/email-display';
import Link from 'next/link';

interface Email {
  id: string;
  accountId: string;
  messageId: string;
  subject: string | null;
  fromAddress: string;
  fromName: string | null;
  snippet: string | null;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  aiCategory: string | null;
  aiPriority: string | null;
  account?: {
    email: string;
    displayName: string | null;
  };
}

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  normal: 'bg-gray-400',
  low: 'bg-blue-400',
};

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    if (!query) {
      setEmails([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/emails/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setEmails(data.emails || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  if (!query) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Search className="h-16 w-16 mb-4 opacity-20" />
        <p>Enter a search term to find emails</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-96 border-r flex flex-col">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/inbox">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h2 className="font-medium">Search Results</h2>
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Searching...' : `${emails.length} results for "${query}"`}
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-3 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No emails found for "{query}"</p>
            </div>
          ) : (
            <div className="divide-y">
              {emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmailId(email.id)}
                  className={cn(
                    'flex items-start gap-3 p-3 cursor-pointer transition-colors',
                    selectedEmailId === email.id ? 'bg-secondary' : 'hover:bg-muted/50',
                    !email.isRead && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-center gap-2 pt-0.5">
                    <Star
                      className={cn(
                        'h-4 w-4',
                        email.isStarred ? 'text-yellow-500 fill-current' : 'text-muted-foreground'
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm truncate', !email.isRead && 'font-semibold')}>
                        {email.fromName || email.fromAddress}
                      </span>
                      {email.aiPriority && (
                        <div className={cn('w-2 h-2 rounded-full', priorityColors[email.aiPriority] || priorityColors.normal)} />
                      )}
                      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                        {formatDate(email.receivedAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('text-sm truncate', !email.isRead && 'font-medium')}>
                        {email.subject || '(No Subject)'}
                      </span>
                      {email.hasAttachments && <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    </div>

                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {truncate(email.snippet || '', 80)}
                    </p>

                    <div className="flex items-center gap-1 mt-1">
                      {email.aiCategory && (
                        <Badge variant="outline" className="text-xs py-0 h-5">
                          {email.aiCategory}
                        </Badge>
                      )}
                      {email.account && (
                        <Badge variant="secondary" className="text-xs py-0 h-5">
                          {email.account.displayName || email.account.email}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1">
        <EmailDisplay emailId={selectedEmailId} onEmailUpdated={fetchResults} />
      </div>
    </div>
  );
}
