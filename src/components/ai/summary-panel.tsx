'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Sparkles } from 'lucide-react';
import { AIExplainer, AIBadge, AIProcessingNote } from './ai-explainer';

interface AISummaryPanelProps {
  summary: string | null;
  isLoading?: boolean;
  isProcessing?: boolean;
}

export function AISummaryPanel({ summary, isLoading, isProcessing }: AISummaryPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Summary
            <AIBadge />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Summary
            <AIBadge />
            <AIExplainer feature="summary" inline />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isProcessing ? (
            <AIProcessingNote />
          ) : (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI summary will appear here once processed.
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
          <FileText className="h-4 w-4" />
          Summary
          <AIBadge />
          <AIExplainer feature="summary" inline />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">{summary}</p>
      </CardContent>
    </Card>
  );
}
