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
  AlertCircle,
  Info,
  ArrowRight,
  Mail,
  Clock,
} from 'lucide-react';
import type { BriefContent } from '@/lib/ai/brief-generator';

interface AIBriefProps {
  onSelectEmail?: (emailId: string) => void;
}

export function AIBrief({ onSelectEmail }: AIBriefProps) {
  const [brief, setBrief] = useState<BriefContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const fetchBrief = async () => {
      try {
        const res = await fetch('/api/brief');
        if (!res.ok) return;
        const data = await res.json();
        if (data.brief) setBrief(data.brief);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    };
    fetchBrief();
  }, []);

  if (dismissed || (!loading && !brief)) return null;

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
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setDismissed(true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="px-4 pb-4 space-y-3">
            {/* Summary */}
            <p className="text-sm text-muted-foreground">{brief.summary}</p>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {brief.stats.unreadCount > 0 && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {brief.stats.unreadCount} unread
                </span>
              )}
              {brief.stats.totalToday > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {brief.stats.totalToday} today
                </span>
              )}
              {brief.stats.topSenders.length > 0 && (
                <span className="truncate">
                  Top: {brief.stats.topSenders.slice(0, 2).join(', ')}
                </span>
              )}
            </div>

            {/* Action Items */}
            {brief.actionItems.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                  Action items
                </h4>
                {brief.actionItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => item.messageId && onSelectEmail?.(item.messageId)}
                    className="flex items-center gap-2 w-full text-left text-sm p-2 rounded-md hover:bg-muted/50 transition-colors group"
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        item.priority === 'urgent'
                          ? 'bg-red-500'
                          : item.priority === 'high'
                            ? 'bg-orange-500'
                            : 'bg-blue-400'
                      }`}
                    />
                    <span className="flex-1 truncate">{item.text}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}

            {/* Highlights */}
            {brief.highlights.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {brief.highlights.map((h, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted"
                  >
                    {h.type === 'alert' ? (
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                    ) : (
                      <Info className="h-3 w-3 text-blue-500" />
                    )}
                    {h.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
