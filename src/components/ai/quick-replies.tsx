'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Copy, Check, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AIExplainer, AIBadge, AIProcessingNote } from './ai-explainer';

interface QuickRepliesProps {
  replies: string[] | null;
  isLoading?: boolean;
  isProcessing?: boolean;
  onSelect?: (reply: string) => void;
}

export function QuickReplies({ replies, isLoading, isProcessing, onSelect }: QuickRepliesProps) {
  const { toast } = useToast();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (reply: string, index: number) => {
    await navigator.clipboard.writeText(reply);
    setCopiedIndex(index);
    toast({
      title: 'Copied to clipboard',
      description: 'Reply text has been copied. Paste it into your reply.',
    });
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Quick Replies
            <AIBadge />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!replies || replies.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Quick Replies
            <AIBadge />
            <AIExplainer feature="replies" inline />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isProcessing ? (
            <AIProcessingNote />
          ) : (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI suggestions will appear here once processed.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Quick Replies
          <AIBadge />
          <AIExplainer feature="replies" inline />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground mb-3">
          Click a suggestion to use it, or copy and edit as needed.
        </p>
        {replies.map((reply, index) => (
          <div
            key={index}
            className="p-3 rounded-lg border bg-background hover:bg-muted/50 hover:border-primary/30 transition-colors cursor-pointer group"
            onClick={() => onSelect?.(reply)}
          >
            <p className="text-sm line-clamp-3">{reply}</p>
            <div className="flex justify-end mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(reply, index);
                }}
              >
                {copiedIndex === index ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
