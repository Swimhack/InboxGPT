'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  Circle,
  CircleAlert,
} from 'lucide-react';
import type { BriefResult } from '@/lib/ai/client';
import { apiUrl } from '@/lib/utils';

interface AIBriefProps {
  onSelectEmail?: (emailId: string) => void;
}

const DISMISS_KEY = 'inboxgpt-dashboard-brief-dismissed';

const urgencyColors = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-blue-400',
};

const priorityVariant = {
  urgent: 'destructive' as const,
  high: 'default' as const,
  normal: 'secondary' as const,
  low: 'outline' as const,
};

export function AIBrief({ onSelectEmail }: AIBriefProps) {
  const [brief, setBrief] = useState<BriefResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const fetchBrief = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/brief'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      if (data.brief) setBrief(data.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brief');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem(DISMISS_KEY);
    if (wasDismissed) {
      setDismissed(true);
      setLoading(false);
      return;
    }
    fetchBrief();
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const handleReshow = () => {
    sessionStorage.removeItem(DISMISS_KEY);
    setDismissed(false);
    fetchBrief();
  };

  if (dismissed) {
    return (
      <button
        onClick={handleReshow}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        Show AI Brief
      </button>
    );
  }

  if (loading) {
    return (
      <Card className="mx-3 mt-3 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mx-3 mt-3 border-red-200 bg-red-50/50 dark:bg-red-950/20">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <CircleAlert className="w-4 h-4" />
              {error}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={fetchBrief} className="h-7 px-2">
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-7 px-2">
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!brief) return null;

  return (
    <Card className="mx-3 mt-3 border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-purple-500/5 overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <Badge variant="secondary" className="text-xs font-normal gap-1">
              AI Brief
            </Badge>
            <span className="text-sm font-medium">{brief.greeting}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchBrief}>
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDismiss}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="px-4 pb-4 space-y-3">
            {/* Summary */}
            {brief.summary && (
              <p className="text-sm text-muted-foreground">{brief.summary}</p>
            )}

            {/* Sections */}
            {brief.sections.map((section, i) => (
              <div key={i}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {section.title}
                </h4>
                <div className="space-y-1">
                  {section.items.map((item, j) => (
                    <div key={j} className="flex items-start gap-2 text-xs">
                      <Badge
                        variant={priorityVariant[item.priority as keyof typeof priorityVariant] || 'secondary'}
                        className="text-[10px] px-1 py-0 shrink-0 mt-0.5"
                      >
                        {item.priority}
                      </Badge>
                      <div className="min-w-0">
                        <span className="font-medium">{item.from}</span>
                        <span className="text-muted-foreground"> — {item.summary}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Action Items */}
            {brief.actionItems.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                  Action items
                </h4>
                {brief.actionItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 w-full text-left text-sm p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <Circle
                      className={`w-2 h-2 shrink-0 fill-current ${
                        urgencyColors[item.urgency] || 'bg-blue-400'
                      } ${
                        item.urgency === 'high' ? 'text-red-500' :
                        item.urgency === 'medium' ? 'text-amber-500' : 'text-blue-500'
                      }`}
                    />
                    <span className="flex-1 truncate">{item.text}</span>
                    <span className="text-xs text-muted-foreground">({item.source})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
