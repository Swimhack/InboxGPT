'use client';

import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getUserFriendlyError, type FriendlyErrorInfo } from '@/lib/errors/user-friendly';
import Link from 'next/link';

interface FriendlyErrorProps {
  /** The error to display (can be Error, string, or any value) */
  error: Error | string | unknown;
  /** Optional callback when retry button is clicked */
  onRetry?: () => void;
  /** Whether a retry is currently in progress */
  isRetrying?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Use compact variant for inline display */
  compact?: boolean;
}

/**
 * FriendlyError - Displays user-friendly error messages
 *
 * Takes technical errors and shows helpful, non-scary messages.
 * Automatically maps common errors like "ECONNREFUSED" to
 * "Can't reach email server. Try again in a few minutes."
 */
export function FriendlyError({
  error,
  onRetry,
  isRetrying = false,
  className = '',
  compact = false,
}: FriendlyErrorProps) {
  const friendly = getUserFriendlyError(error);

  if (compact) {
    return (
      <div className={`flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 ${className}`}>
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">{friendly.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{friendly.description}</p>
          {(onRetry || friendly.actionUrl) && (
            <div className="flex gap-2 mt-2">
              {onRetry && friendly.canRetry && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="h-7 text-xs"
                >
                  {isRetrying ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Try Again
                </Button>
              )}
              {friendly.actionUrl && (
                <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                  <Link href={friendly.actionUrl}>
                    {friendly.actionLabel || friendly.action || 'Learn More'}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className={`border-destructive/30 bg-destructive/5 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          {friendly.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-4">{friendly.description}</p>
        <div className="flex flex-wrap gap-2">
          {onRetry && friendly.canRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
              {isRetrying ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Try Again
            </Button>
          )}
          {friendly.actionUrl && (
            <Button size="sm" asChild>
              <Link href={friendly.actionUrl}>
                {friendly.actionLabel || friendly.action || 'Learn More'}
                {friendly.actionUrl.startsWith('http') && (
                  <ExternalLink className="h-3 w-3 ml-2" />
                )}
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * InlineError - A minimal inline error display
 *
 * Use for form validation errors or minor issues
 */
export function InlineError({
  error,
  className = '',
}: {
  error: Error | string | unknown;
  className?: string;
}) {
  const friendly = getUserFriendlyError(error);

  return (
    <p className={`text-sm text-destructive flex items-center gap-1.5 ${className}`}>
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {friendly.title}: {friendly.description}
    </p>
  );
}

/**
 * ErrorBanner - A full-width error banner for page-level errors
 */
export function ErrorBanner({
  error,
  onRetry,
  isRetrying = false,
  onDismiss,
}: {
  error: Error | string | unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
  onDismiss?: () => void;
}) {
  const friendly = getUserFriendlyError(error);

  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <span className="font-medium text-destructive">{friendly.title}</span>
            <span className="text-muted-foreground mx-2">—</span>
            <span className="text-sm text-muted-foreground">{friendly.description}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onRetry && friendly.canRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
              {isRetrying ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                'Retry'
              )}
            </Button>
          )}
          {friendly.actionUrl && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={friendly.actionUrl}>
                {friendly.actionLabel || 'Fix'}
              </Link>
            </Button>
          )}
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
