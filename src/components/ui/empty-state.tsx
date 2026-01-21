'use client';

import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface EmptyStateProps {
  /** Icon to display */
  icon: LucideIcon;
  /** Main title */
  title: string;
  /** Description text */
  description: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  /** Additional CSS classes */
  className?: string;
  /** Use compact layout */
  compact?: boolean;
}

/**
 * EmptyState - Displays helpful messages when content is empty
 *
 * Use this for:
 * - Empty inbox
 * - No search results
 * - No accounts connected
 * - Empty folders
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  compact = false,
}: EmptyStateProps) {
  const ActionButton = ({ action: a }: { action: NonNullable<EmptyStateProps['action']> }) => {
    if (a.href) {
      return (
        <Button asChild>
          <Link href={a.href}>{a.label}</Link>
        </Button>
      );
    }
    return <Button onClick={a.onClick}>{a.label}</Button>;
  };

  const SecondaryButton = ({ action: a }: { action: NonNullable<EmptyStateProps['secondaryAction']> }) => {
    if (a.href) {
      return (
        <Button variant="outline" asChild>
          <Link href={a.href}>{a.label}</Link>
        </Button>
      );
    }
    return <Button variant="outline" onClick={a.onClick}>{a.label}</Button>;
  };

  if (compact) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 px-4 text-center ${className}`}>
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-xs mb-4">{description}</p>
        {(action || secondaryAction) && (
          <div className="flex gap-2">
            {action && <Button size="sm" asChild={!!action.href} onClick={action.onClick}>
              {action.href ? <Link href={action.href}>{action.label}</Link> : action.label}
            </Button>}
            {secondaryAction && (
              <Button size="sm" variant="outline" asChild={!!secondaryAction.href} onClick={secondaryAction.onClick}>
                {secondaryAction.href ? <Link href={secondaryAction.href}>{secondaryAction.label}</Link> : secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex gap-3">
          {action && <ActionButton action={action} />}
          {secondaryAction && <SecondaryButton action={secondaryAction} />}
        </div>
      )}
    </div>
  );
}

// Pre-configured empty states for common scenarios
import {
  Mail,
  Inbox,
  Star,
  Search,
  Send,
  Archive,
  Trash2,
  FolderOpen,
  UserPlus,
  Loader2,
} from 'lucide-react';

export function EmptyInbox({ hasAccounts = true }: { hasAccounts?: boolean }) {
  if (!hasAccounts) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Connect Your Email"
        description="Add your first email account to start seeing your messages in one unified inbox."
        action={{ label: 'Add Account', href: '/accounts' }}
      />
    );
  }

  return (
    <EmptyState
      icon={Inbox}
      title="Inbox Zero!"
      description="You've processed all your emails. New messages will appear here when they arrive."
    />
  );
}

export function EmptyStarred() {
  return (
    <EmptyState
      icon={Star}
      title="No Starred Emails"
      description="Star important emails to find them quickly later. Just click the star icon on any email."
    />
  );
}

export function EmptySearchResults({ query }: { query: string }) {
  return (
    <EmptyState
      icon={Search}
      title="No Results Found"
      description={`No emails match "${query}". Try different keywords or check your spelling.`}
      secondaryAction={{ label: 'Clear Search', href: '/inbox' }}
    />
  );
}

export function EmptySent() {
  return (
    <EmptyState
      icon={Send}
      title="No Sent Emails"
      description="Emails you send will appear here. Start by composing a new message."
      action={{ label: 'Compose', href: '/inbox/compose' }}
    />
  );
}

export function EmptyArchive() {
  return (
    <EmptyState
      icon={Archive}
      title="Archive is Empty"
      description="Archived emails will appear here. Archive emails to clean up your inbox without deleting them."
    />
  );
}

export function EmptyTrash() {
  return (
    <EmptyState
      icon={Trash2}
      title="Trash is Empty"
      description="Deleted emails will appear here. They'll be permanently removed after 30 days."
    />
  );
}

export function EmptyCategory({ category }: { category: string }) {
  const categoryNames: Record<string, string> = {
    primary: 'Primary',
    social: 'Social',
    promotions: 'Promotions',
    updates: 'Updates',
    forums: 'Forums',
  };

  return (
    <EmptyState
      icon={FolderOpen}
      title={`No ${categoryNames[category] || category} Emails`}
      description={`Emails categorized as ${categoryNames[category]?.toLowerCase() || category} will appear here.`}
    />
  );
}

export function EmptyFolder({ folder }: { folder: string }) {
  return (
    <EmptyState
      icon={Mail}
      title={`${folder} is Empty`}
      description={`No emails in ${folder.toLowerCase()} yet.`}
    />
  );
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function SyncingState({ emailCount = 0 }: { emailCount?: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Syncing Your Emails</h3>
      <p className="text-muted-foreground max-w-md">
        {emailCount > 0
          ? `Found ${emailCount} emails so far. This might take a moment for the first sync.`
          : 'Connecting to your email server. This might take a moment for the first sync.'}
      </p>
    </div>
  );
}
