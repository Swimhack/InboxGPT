'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Archive,
  Star,
  MoreVertical,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Mail,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AISummaryPanel } from '@/components/ai/summary-panel';
import { QuickReplies } from '@/components/ai/quick-replies';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/utils';

interface EmailDetails {
  id: string;
  accountId: string;
  messageId: string;
  subject: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string | null;
  ccAddresses: string | null;
  sentAt: string | null;
  receivedAt: string;
  bodyText: string | null;
  bodyHtml: string | null;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  hasAttachments: boolean;
  aiCategory: string | null;
  aiPriority: string | null;
  aiSummary: string | null;
  aiSuggestedReplies: string | null;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string | null;
    size: number | null;
  }>;
  account?: {
    email: string;
    displayName: string | null;
  };
}

interface EmailDisplayProps {
  emailId: string | null;
  onEmailUpdated?: () => void;
}

export function EmailDisplay({ emailId, onEmailUpdated }: EmailDisplayProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState<EmailDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(true);

  useEffect(() => {
    if (!emailId) {
      setEmail(null);
      return;
    }

    const fetchEmail = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl(`/api/emails/${emailId}`));
        if (!res.ok) throw new Error('Failed to fetch email');

        const data = await res.json();
        setEmail(data.email);
      } catch (error) {
        console.error('Failed to fetch email:', error);
        toast({
          title: 'Error',
          description: 'Failed to load email',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmail();
  }, [emailId]);

  const handleStar = async () => {
    if (!email) return;

    try {
      const res = await fetch(apiUrl(`/api/emails/${email.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: !email.isStarred }),
      });

      if (!res.ok) throw new Error('Failed to update');

      setEmail({ ...email, isStarred: !email.isStarred });
      onEmailUpdated?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update email',
        variant: 'destructive',
      });
    }
  };

  const handleArchive = async () => {
    if (!email) return;

    try {
      const res = await fetch(apiUrl(`/api/emails/${email.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      });

      if (!res.ok) throw new Error('Failed to archive');

      toast({ title: 'Email archived' });
      onEmailUpdated?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to archive email',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!email) return;

    try {
      const res = await fetch(apiUrl(`/api/emails/${email.id}`), {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete');

      toast({ title: 'Email deleted' });
      onEmailUpdated?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete email',
        variant: 'destructive',
      });
    }
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const parseAddresses = (json: string | null): Array<{ address: string; name?: string }> => {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  const parseSuggestedReplies = (json: string | null): string[] => {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  if (!emailId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Mail className="h-16 w-16 mb-4 opacity-20" />
        <p>Select an email to view</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p>Email not found</p>
      </div>
    );
  }

  const toAddresses = parseAddresses(email.toAddresses);
  const suggestedReplies = parseSuggestedReplies(email.aiSuggestedReplies);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        {/* Email Header */}
        <div className="p-4 border-b">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-xl font-semibold">{email.subject || '(No Subject)'}</h1>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStar}
                className={email.isStarred ? 'text-yellow-500' : ''}
              >
                <Star className={`h-4 w-4 ${email.isStarred ? 'fill-current' : ''}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleArchive}>
                <Archive className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Mark as unread</DropdownMenuItem>
                  <DropdownMenuItem>Add label</DropdownMenuItem>
                  <DropdownMenuItem>Move to folder</DropdownMenuItem>
                  <DropdownMenuItem>Report spam</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-green-500 text-white">
                {getInitials(email.fromName || email.fromAddress)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{email.fromName || email.fromAddress}</span>
                <span className="text-sm text-muted-foreground">&lt;{email.fromAddress}&gt;</span>
              </div>
              <div className="text-sm text-muted-foreground">
                to {toAddresses.map((a) => a.name || a.address).join(', ') || 'me'}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date(email.receivedAt).toLocaleString()}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            {email.aiCategory && <Badge variant="outline">{email.aiCategory}</Badge>}
            {email.aiPriority && (
              <Badge variant={email.aiPriority === 'high' || email.aiPriority === 'urgent' ? 'destructive' : 'secondary'}>
                {email.aiPriority} priority
              </Badge>
            )}
          </div>
        </div>

        {/* Email Body */}
        <ScrollArea className="flex-1 p-4">
          {email.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm">{email.bodyText || 'No content'}</pre>
          )}

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div className="mt-6 p-4 border rounded-lg">
              <h3 className="font-medium mb-3">Attachments ({email.attachments.length})</h3>
              <div className="space-y-2">
                {email.attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 text-sm">
                    <span>{att.filename}</span>
                    {att.size && (
                      <span className="text-muted-foreground">
                        ({Math.round(att.size / 1024)}KB)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Reply Actions */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                const params = new URLSearchParams({
                  replyTo: email.fromAddress,
                  subject: `Re: ${email.subject || ''}`,
                  accountId: email.accountId,
                  inReplyTo: email.messageId,
                });
                router.push(`/inbox/inbox/compose?${params.toString()}`);
              }}
            >
              <Reply className="mr-2 h-4 w-4" />
              Reply
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const allAddresses = [
                  email.fromAddress,
                  ...(parseAddresses(email.toAddresses).map(a => a.address)),
                  ...(parseAddresses(email.ccAddresses).map(a => a.address)),
                ].filter((v, i, arr) => arr.indexOf(v) === i);
                const params = new URLSearchParams({
                  replyTo: allAddresses.join(','),
                  subject: `Re: ${email.subject || ''}`,
                  accountId: email.accountId,
                  inReplyTo: email.messageId,
                });
                router.push(`/inbox/inbox/compose?${params.toString()}`);
              }}
            >
              <ReplyAll className="mr-2 h-4 w-4" />
              Reply All
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const params = new URLSearchParams({
                  subject: `Fwd: ${email.subject || ''}`,
                  accountId: email.accountId,
                  body: `\n\n---------- Forwarded message ----------\nFrom: ${email.fromName || email.fromAddress}\nDate: ${new Date(email.receivedAt).toLocaleString()}\nSubject: ${email.subject || ''}\n\n${email.bodyText || ''}`,
                });
                router.push(`/inbox/inbox/compose?${params.toString()}`);
              }}
            >
              <Forward className="mr-2 h-4 w-4" />
              Forward
            </Button>
          </div>
        </div>
      </div>

      {/* AI Panel */}
      <div className="w-80 border-l flex flex-col bg-muted/30">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">AI Assistant</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setShowAIPanel(!showAIPanel)}>
            {showAIPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {showAIPanel && (
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              <AISummaryPanel summary={email.aiSummary} />
              <Separator />
              <QuickReplies
                replies={suggestedReplies}
                onSelect={(reply) => {
                  if (!email) return;
                  const params = new URLSearchParams({
                    replyTo: email.fromAddress,
                    subject: `Re: ${email.subject || ''}`,
                    body: reply,
                    accountId: email.accountId,
                    inReplyTo: email.messageId,
                  });
                  router.push(`/inbox/inbox/compose?${params.toString()}`);
                }}
              />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
