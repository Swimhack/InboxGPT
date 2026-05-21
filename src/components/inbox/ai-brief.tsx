'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, X, ChevronDown, ChevronUp, CircleAlert, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiUrl } from '@/lib/utils';

interface BriefSection {
  title: string;
  items: Array<{ subject: string; from: string; summary: string; priority: string }>;
}

interface BriefActionItem {
  text: string;
  source: string;
  urgency: 'high' | 'medium' | 'low';
}

interface BriefData {
  greeting: string;
  summary: string;
  sections: BriefSection[];
  actionItems: BriefActionItem[];
}

type BriefState = 'loading' | 'ready' | 'error' | 'dismissed' | 'locked';

const DISMISS_KEY = 'inboxgpt-brief-dismissed';

const priorityVariant = {
  urgent: 'destructive' as const,
  high: 'default' as const,
  normal: 'secondary' as const,
  low: 'outline' as const,
};

export function AIBrief({ plan }: { plan?: string }) {
  const isLocked = !plan || plan === 'free';
  const [state, setState] = useState<BriefState>(isLocked ? 'locked' : 'loading');
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [error, setError] = useState<string>('');
  const [collapsed, setCollapsed] = useState(false);

  const fetchBrief = useCallback(async () => {
    setState('loading');
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
      setBrief(data.brief);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brief');
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (isLocked) {
      setState('locked');
      return;
    }
    const dismissed = sessionStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      setState('dismissed');
      return;
    }
    fetchBrief();
  }, [fetchBrief, isLocked]);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setState('dismissed');
  };

  const handleReshow = () => {
    sessionStorage.removeItem(DISMISS_KEY);
    fetchBrief();
  };

  if (state === 'locked') {
    return (
      <div className="border-b p-3 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="h-4 w-4 text-purple-500 shrink-0" />
            <span className="font-medium text-xs truncate">AI Daily Brief</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Pro</Badge>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2 shrink-0" onClick={() => window.location.href = '/pricing'}>
            Unlock
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
          Get a daily AI summary — priorities, action items, and what needs attention.
        </p>
      </div>
    );
  }

  if (state === 'dismissed') {
    return (
      <button
        onClick={handleReshow}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border-b w-full transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        Show AI Brief
      </button>
    );
  }

  if (state === 'loading') {
    return (
      <div className="border-b bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
          <span className="text-sm font-medium">Preparing your brief...</span>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="border-b bg-red-50/50 dark:bg-red-950/20 p-3">
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
      </div>
    );
  }

  if (!brief) return null;

  return (
    <div className="border-b bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium">AI Brief</span>
          {brief.summary && (
            <span className="text-xs text-muted-foreground">{brief.summary}</span>
          )}
        </div>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)} className="h-7 w-7 p-0">
            {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchBrief} className="h-7 w-7 p-0">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-7 w-7 p-0">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-3">
          {/* Greeting */}
          {brief.greeting && (
            <p className="text-sm text-muted-foreground">{brief.greeting}</p>
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
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Action Items
              </h4>
              <ul className="space-y-1">
                {brief.actionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <Circle
                      className={`w-2 h-2 mt-1 shrink-0 fill-current ${
                        item.urgency === 'high' ? 'text-red-500' :
                        item.urgency === 'medium' ? 'text-amber-500' : 'text-blue-500'
                      }`}
                    />
                    <span>
                      {item.text}
                      <span className="text-muted-foreground ml-1">({item.source})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
