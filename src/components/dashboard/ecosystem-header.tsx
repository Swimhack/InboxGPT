'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Settings, LogOut, Menu } from 'lucide-react';
import { useSidebar } from '@/components/dashboard/sidebar';

const CURRENT_PRODUCT = 'InboxGPT';

const ECOSYSTEM = [
  { name: 'StricklandAI', href: 'https://stricklandai.com', external: true },
  { name: 'LeadSnap', href: 'https://leadsnap.stricklandai.com', external: true },
  { name: 'InboxGPT', href: '/inbox', external: false },
] as const;

function StrixOwl({ size = 28 }: { size?: number }) {
  const s = size;
  const thick = s < 24 ? 6 : s < 40 ? 4 : s < 64 ? 3 : 2.5;
  const med = s < 24 ? 5 : s < 40 ? 3.5 : s < 64 ? 2.5 : 2;
  const showDetail = s >= 28;
  const showTufts = s >= 36;

  return (
    <svg
      width={s}
      height={Math.round(s * 1.08)}
      viewBox="0 0 120 130"
      fill="none"
    >
      <path d="M60 4 L106 30 L106 86 L60 126 L14 86 L14 30Z" stroke="#3B82F6" strokeWidth={thick} fill="none" />
      <circle cx="44" cy="54" r="15" stroke="white" strokeWidth={med} fill="none" />
      <circle cx="44" cy="54" r="7" fill="white" />
      <circle cx="76" cy="54" r="15" stroke="white" strokeWidth={med} fill="none" />
      <circle cx="76" cy="54" r="7" fill="white" />
      {showDetail && (
        <path d="M27 42 Q44 33 60 41 Q76 33 93 42" stroke="white" strokeWidth={med} fill="none" strokeLinecap="round" />
      )}
      {showDetail && (
        <path d="M55 68 L60 78 L65 68" stroke="white" strokeWidth={med} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
      {showTufts && (
        <>
          <line x1="36" y1="34" x2="26" y2="16" stroke="white" strokeWidth={med} strokeLinecap="round" />
          <line x1="84" y1="34" x2="94" y2="16" stroke="white" strokeWidth={med} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

interface EcosystemHeaderProps {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export function EcosystemHeader({ user }: EcosystemHeaderProps) {
  const { setOpen } = useSidebar();

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <nav className="sticky top-0 z-50 w-full border-b-2 border-slate-700 bg-slate-900/95 backdrop-blur-sm">
      <div className="flex items-center justify-between h-14 px-3 sm:px-4">
        {/* Left: Sidebar trigger (mobile) + Logo + Product + Divider + Ecosystem badges */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile sidebar trigger */}
          <button
            onClick={() => setOpen(true)}
            className="md:hidden flex items-center justify-center w-8 h-8 text-slate-400 hover:text-white transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* StrixOwl + STRICKLANDAI */}
          <a
            href="https://stricklandai.com"
            className="flex items-center gap-1.5 shrink-0"
            title="StricklandAI Home"
          >
            <StrixOwl size={24} />
            <span className="hidden sm:inline font-mono text-xs font-bold text-slate-300 tracking-wide">
              STRICKLAND<span className="text-blue-500">AI</span>
            </span>
          </a>

          {/* Product name */}
          <span className="font-mono text-sm font-bold text-blue-500 shrink-0">
            {CURRENT_PRODUCT}
          </span>

          {/* Divider */}
          <div className="hidden md:block w-px h-5 bg-slate-700" />

          {/* Ecosystem badges — md+ only */}
          <div className="hidden md:flex items-center gap-1.5">
            {ECOSYSTEM.map((product) => {
              const isActive = product.name === CURRENT_PRODUCT;
              const Tag = product.external ? 'a' : Link;
              const props = product.external
                ? { href: product.href, target: '_blank', rel: 'noopener noreferrer' }
                : { href: product.href };

              return (
                <Tag
                  key={product.name}
                  {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
                  className={`font-mono text-[11px] px-2 py-0.5 border rounded transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                  }`}
                >
                  {product.name}
                </Tag>
              );
            })}
          </div>
        </div>

        {/* Right: Settings + User menu */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/settings"
            className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-slate-200 transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>

          {/* User avatar + dropdown */}
          <div className="relative group">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 transition-colors"
              title={user.email}
            >
              <div className="w-7 h-7 bg-blue-500/20 border border-blue-500/50 flex items-center justify-center rounded-full">
                <span className="text-blue-500 font-mono text-xs font-bold">
                  {initials}
                </span>
              </div>
              <span className="hidden sm:block font-mono text-xs text-slate-300 max-w-[120px] truncate">
                {user.email}
              </span>
            </button>

            {/* Dropdown on hover/focus */}
            <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50">
              <div className="px-3 py-2 border-b border-slate-700">
                <p className="font-mono text-xs text-slate-300 truncate">{user.name}</p>
                <p className="font-mono text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 font-mono text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Settings
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-2 w-full px-3 py-2 font-mono text-xs text-red-400 hover:text-red-300 hover:bg-slate-700/50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
