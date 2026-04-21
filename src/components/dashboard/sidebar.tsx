'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Inbox,
  Star,
  Send,
  FileText,
  Trash2,
  Archive,
  Tag,
  Settings,
  PlusCircle,
  Mail,
  HelpCircle,
  Menu,
  X,
} from 'lucide-react';
import { useState, useEffect, createContext, useContext } from 'react';

const mainNav = [
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/inbox/starred', label: 'Starred', icon: Star },
  { href: '/inbox/sent', label: 'Sent', icon: Send },
  { href: '/inbox/drafts', label: 'Drafts', icon: FileText },
  { href: '/inbox/archive', label: 'Archive', icon: Archive },
  { href: '/inbox/trash', label: 'Trash', icon: Trash2 },
];

const categories = [
  { label: 'Primary', color: 'bg-blue-500' },
  { label: 'Social', color: 'bg-green-500' },
  { label: 'Promotions', color: 'bg-yellow-500' },
  { label: 'Updates', color: 'bg-purple-500' },
];

// Context so header can toggle sidebar
const SidebarContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="p-4">
        <Link href="/inbox" className="flex items-center gap-2" onClick={onNavigate}>
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Mail className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold">InboxGPT</span>
        </Link>
      </div>

      <div className="px-3 pb-4">
        <Button className="w-full" asChild>
          <Link href="/inbox/compose" onClick={onNavigate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Compose
          </Link>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 space-y-1">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                pathname === item.href
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </div>

        <Separator className="my-4" />

        <div className="px-3">
          <h3 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Categories
          </h3>
          <div className="space-y-1">
            {categories.map((category) => (
              <Link
                key={category.label}
                href={`/inbox/category/${category.label.toLowerCase()}`}
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
              >
                <Tag className="h-4 w-4" />
                <span className={cn('w-2 h-2 rounded-full', category.color)} />
                {category.label}
              </Link>
            ))}
          </div>
        </div>

        <Separator className="my-4" />

        <div className="px-3">
          <h3 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Accounts
          </h3>
          <Link
            href="/accounts"
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              pathname === '/accounts'
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            )}
          >
            <PlusCircle className="h-4 w-4" />
            Manage Accounts
          </Link>
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-3 space-y-1">
        <Link
          href="/help"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            pathname === '/help'
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          )}
        >
          <HelpCircle className="h-4 w-4" />
          Help & FAQ
        </Link>
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </>
  );
}

export function Sidebar() {
  const { open, setOpen } = useSidebar();
  const pathname = usePathname();

  // Close mobile drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 border-r bg-muted/30 flex-col">
        <SidebarContent />
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 bg-background border-r flex flex-col transition-transform duration-200 ease-in-out md:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="absolute right-2 top-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </div>
    </>
  );
}

export function SidebarTrigger() {
  const { setOpen } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
