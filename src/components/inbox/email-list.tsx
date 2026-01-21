'use client';

import { useState, useEffect } from 'react';
import { cn, formatDate, truncate } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, Paperclip, RefreshCw, Archive, Trash2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  EmptyInbox,
  EmptyStarred,
  EmptySent,
  EmptyArchive,
  EmptyTrash,
  EmptyCategory,
  SyncingState,
} from '@/components/ui/empty-state';

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
  aiProcessedAt: string | null;
  account?: {
    email: string;
    displayName: string | null;
  };
}

interface EmailListProps {
  folder?: string;
  accountId?: string;
  category?: string;
  onSelectEmail?: (emailId: string) => void;
  selectedEmailId?: string | null;
}

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  normal: 'bg-gray-400',
  low: 'bg-blue-400',
};

export function EmailList({ folder, accountId, category, onSelectEmail, selectedEmailId }: EmailListProps) {
  const { toast } = useToast();
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchEmails = async () => {
    try {
      const params = new URLSearchParams();
      if (folder) params.set('folder', folder);
      if (accountId) params.set('accountId', accountId);
      if (category) params.set('category', category);

      const res = await fetch(`/api/emails?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch emails');

      const data = await res.json();
      setEmails(data.emails || []);
    } catch (error) {
      console.error('Failed to fetch emails:', error);
      toast({
        title: 'Error',
        description: 'Failed to load emails',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [folder, accountId, category]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchEmails();
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEmails(newSelected);
  };

  const handleStar = async (e: React.MouseEvent, emailId: string, currentStarred: boolean) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: !currentStarred }),
      });

      if (!res.ok) throw new Error('Failed to update');

      setEmails((prev) =>
        prev.map((email) =>
          email.id === emailId ? { ...email, isStarred: !currentStarred } : email
        )
      );
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update email',
        variant: 'destructive',
      });
    }
  };

  const handleBulkAction = async (action: 'archive' | 'delete') => {
    if (selectedEmails.size === 0) return;

    try {
      const updates = Array.from(selectedEmails).map((id) =>
        fetch(`/api/emails/${id}`, {
          method: action === 'delete' ? 'DELETE' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: action === 'archive' ? JSON.stringify({ isArchived: true }) : undefined,
        })
      );

      await Promise.all(updates);

      setEmails((prev) => prev.filter((email) => !selectedEmails.has(email.id)));
      setSelectedEmails(new Set());

      toast({
        title: 'Success',
        description: `${selectedEmails.size} email(s) ${action === 'delete' ? 'deleted' : 'archived'}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${action} emails`,
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b">
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex-1 p-3 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={emails.length > 0 && selectedEmails.size === emails.length}
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedEmails(new Set(emails.map((e) => e.id)));
              } else {
                setSelectedEmails(new Set());
              }
            }}
          />
          <span className="text-sm text-muted-foreground">
            {selectedEmails.size > 0 ? `${selectedEmails.size} selected` : `${emails.length} emails`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {selectedEmails.size > 0 && (
            <>
              <Button variant="ghost" size="icon" onClick={() => handleBulkAction('archive')}>
                <Archive className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleBulkAction('delete')}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {emails.length === 0 ? (
          <div className="p-4">
            {folder === 'starred' && <EmptyStarred />}
            {folder === 'sent' && <EmptySent />}
            {folder === 'archive' && <EmptyArchive />}
            {folder === 'trash' && <EmptyTrash />}
            {category && <EmptyCategory category={category} />}
            {!folder && !category && <EmptyInbox />}
          </div>
        ) : (
          <div className="divide-y">
            {emails.map((email) => (
              <div
                key={email.id}
                onClick={() => onSelectEmail?.(email.id)}
                className={cn(
                  'flex items-start gap-3 p-3 cursor-pointer transition-colors',
                  selectedEmailId === email.id ? 'bg-secondary' : 'hover:bg-muted/50',
                  !email.isRead && 'bg-primary/5'
                )}
              >
                <div className="flex items-center gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedEmails.has(email.id)}
                    onCheckedChange={() => toggleSelect(email.id)}
                  />
                  <button
                    onClick={(e) => handleStar(e, email.id, email.isStarred)}
                    className={cn(
                      'hover:text-yellow-500 transition-colors',
                      email.isStarred ? 'text-yellow-500' : 'text-muted-foreground'
                    )}
                  >
                    <Star className={cn('h-4 w-4', email.isStarred && 'fill-current')} />
                  </button>
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
                    {!email.aiProcessedAt && (
                      <Badge variant="outline" className="text-xs py-0 h-5 text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-950/30">
                        <Sparkles className="h-3 w-3 mr-1 animate-pulse" />
                        Analyzing
                      </Badge>
                    )}
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
  );
}
