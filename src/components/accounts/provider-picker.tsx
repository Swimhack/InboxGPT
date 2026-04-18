'use client';

import { useState, useMemo } from 'react';
import { Search, Wifi } from 'lucide-react';

export interface PickedProvider {
  id: string;
  name: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  authType: 'oauth' | 'app-password' | 'password';
  oauthSupported: boolean;
  appPasswordRequired?: boolean;
  appPasswordUrl?: string;
  appPasswordInstructions?: string;
  helpUrl?: string;
  color: string;        // CSS gradient or color
  textColor: string;
  logo: React.ReactNode;
}

// SVG logos as inline components — no external dependencies
function GmailLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <path d="M6 12h36v24H6z" fill="#fff" />
      <path d="M6 12l18 13L42 12" stroke="#EA4335" strokeWidth="2" fill="none" />
      <path d="M6 12v24l12-12" fill="#34A853" />
      <path d="M42 12v24L30 24" fill="#FBBC04" />
      <path d="M6 36l12-12h12l12 12" fill="#EA4335" />
      <path d="M18 24l6 4 6-4" fill="#C5221F" />
    </svg>
  );
}

function OutlookLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <rect width="48" height="48" rx="4" fill="#0078D4" />
      <rect x="6" y="10" width="20" height="28" rx="2" fill="#106EBE" />
      <rect x="8" y="12" width="16" height="24" rx="1" fill="white" />
      <text x="16" y="26" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#0078D4">O</text>
      <rect x="26" y="14" width="16" height="20" rx="1" fill="white" fillOpacity="0.9" />
      <path d="M26 14l8 8 8-8" stroke="#0078D4" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function YahooLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <rect width="48" height="48" rx="8" fill="#6001D2" />
      <text x="24" y="32" textAnchor="middle" fontSize="22" fontWeight="900" fill="white" fontFamily="Arial">Y!</text>
    </svg>
  );
}

function IcloudLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <rect width="48" height="48" rx="10" fill="#1C1C1E" />
      <path d="M34 28a6 6 0 0 0-4.5-9.8 9 9 0 0 0-17 3.8A7 7 0 0 0 14 36h20a6 6 0 0 0 0-8z" fill="white" />
    </svg>
  );
}

function ProtonLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <rect width="48" height="48" rx="8" fill="#6D4AFF" />
      <path d="M14 32V16h8a8 8 0 0 1 0 16H14z" stroke="white" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      <path d="M22 24l8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function ZohoLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <rect width="48" height="48" rx="8" fill="#C8202B" />
      <text x="24" y="31" textAnchor="middle" fontSize="13" fontWeight="700" fill="white" fontFamily="Arial">ZOHO</text>
    </svg>
  );
}

function FastmailLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <rect width="48" height="48" rx="8" fill="#3A5BCC" />
      <path d="M10 24l14-10 14 10v12H10V24z" fill="white" fillOpacity="0.2" />
      <path d="M10 24l14-10 14 10" stroke="white" strokeWidth="2" fill="none" />
      <rect x="18" y="26" width="12" height="10" fill="white" />
    </svg>
  );
}

function AolLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-8 h-8" fill="none">
      <rect width="48" height="48" rx="8" fill="#1A1A4E" />
      <text x="24" y="30" textAnchor="middle" fontSize="14" fontWeight="900" fill="white" fontFamily="Arial">AOL</text>
    </svg>
  );
}

function CustomServerLogo() {
  return (
    <div className="w-8 h-8 rounded-lg bg-gray-600 flex items-center justify-center">
      <Wifi className="w-5 h-5 text-white" />
    </div>
  );
}

export const ALL_PROVIDERS: PickedProvider[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    color: 'from-red-50 to-orange-50 hover:from-red-100 hover:to-orange-100 border-red-100',
    textColor: 'text-red-700',
    logo: <GmailLogo />,
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: true,
    appPasswordRequired: true,
    appPasswordUrl: 'https://myaccount.google.com/apppasswords',
    appPasswordInstructions: 'Gmail requires an App Password since direct password login is disabled. Go to Google Account → Security → 2-Step Verification → App passwords.',
    helpUrl: 'https://support.google.com/mail/answer/7126229',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    color: 'from-blue-50 to-sky-50 hover:from-blue-100 hover:to-sky-100 border-blue-100',
    textColor: 'text-blue-700',
    logo: <OutlookLogo />,
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    authType: 'password',
    oauthSupported: false,
    helpUrl: 'https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    color: 'from-purple-50 to-violet-50 hover:from-purple-100 hover:to-violet-100 border-purple-100',
    textColor: 'text-purple-700',
    logo: <YahooLogo />,
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://login.yahoo.com/account/security/app-passwords',
    appPasswordInstructions: 'Yahoo requires an App Password for third-party apps. Go to Yahoo Account Security → App Passwords and create one for "Mail".',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    color: 'from-gray-50 to-slate-50 hover:from-gray-100 hover:to-slate-100 border-gray-100',
    textColor: 'text-gray-700',
    logo: <IcloudLogo />,
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://appleid.apple.com/account/manage',
    appPasswordInstructions: 'iCloud requires an app-specific password. Sign in at appleid.apple.com → Sign-In and Security → App-Specific Passwords.',
    helpUrl: 'https://support.apple.com/en-us/HT204397',
  },
  {
    id: 'protonmail',
    name: 'ProtonMail',
    color: 'from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 border-violet-100',
    textColor: 'text-violet-700',
    logo: <ProtonLogo />,
    imap: { host: 'mail.protonmail.com', port: 993, secure: true },
    smtp: { host: 'mail.protonmail.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordInstructions: 'ProtonMail requires the ProtonMail Bridge app running locally to enable IMAP access.',
    helpUrl: 'https://proton.me/mail/bridge',
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    color: 'from-rose-50 to-red-50 hover:from-rose-100 hover:to-red-100 border-rose-100',
    textColor: 'text-rose-700',
    logo: <ZohoLogo />,
    imap: { host: 'imap.zoho.com', port: 993, secure: true },
    smtp: { host: 'smtp.zoho.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://accounts.zoho.com/home#security/security_pwd',
    appPasswordInstructions: 'Go to Zoho Account → Security → App Passwords and generate a new password.',
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    color: 'from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 border-indigo-100',
    textColor: 'text-indigo-700',
    logo: <FastmailLogo />,
    imap: { host: 'imap.fastmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.fastmail.com', port: 587, secure: false },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://www.fastmail.com/settings/security/devicekeys/',
    appPasswordInstructions: 'Go to Fastmail Settings → Password & Security → App Passwords and create a new key.',
  },
  {
    id: 'aol',
    name: 'AOL Mail',
    color: 'from-slate-50 to-blue-50 hover:from-slate-100 hover:to-blue-100 border-slate-100',
    textColor: 'text-slate-700',
    logo: <AolLogo />,
    imap: { host: 'imap.aol.com', port: 993, secure: true },
    smtp: { host: 'smtp.aol.com', port: 465, secure: true },
    authType: 'app-password',
    oauthSupported: false,
    appPasswordRequired: true,
    appPasswordUrl: 'https://login.aol.com/account/security/app-passwords',
    appPasswordInstructions: 'AOL requires an app password. Go to AOL Account Security → App Passwords.',
  },
  {
    id: 'custom',
    name: 'Custom IMAP',
    color: 'from-zinc-50 to-gray-50 hover:from-zinc-100 hover:to-gray-100 border-zinc-200',
    textColor: 'text-zinc-700',
    logo: <CustomServerLogo />,
    imap: { host: '', port: 993, secure: true },
    smtp: { host: '', port: 587, secure: false },
    authType: 'password',
    oauthSupported: false,
  },
];

interface ProviderPickerProps {
  onSelect: (provider: PickedProvider) => void;
}

export function ProviderPicker({ onSelect }: ProviderPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_PROVIDERS;
    const q = search.toLowerCase();
    return ALL_PROVIDERS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.includes(q)
    );
  }, [search]);

  return (
    <div className="w-full space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search providers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/80 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all"
        />
      </div>

      {/* Provider grid */}
      <div className="grid grid-cols-3 gap-3">
        {filtered.map((provider) => (
          <button
            key={provider.id}
            onClick={() => onSelect(provider)}
            className={`
              group relative flex flex-col items-center gap-2.5 p-4 rounded-2xl border
              bg-gradient-to-br ${provider.color}
              transition-all duration-150 active:scale-95
              hover:shadow-md hover:-translate-y-0.5
              focus:outline-none focus:ring-2 focus:ring-blue-500/40
            `}
          >
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center transition-shadow group-hover:shadow-md">
              {provider.logo}
            </div>
            <span className={`text-xs font-semibold text-center leading-tight ${provider.textColor}`}>
              {provider.name}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">
          No providers match &ldquo;{search}&rdquo; — try Custom IMAP
        </div>
      )}
    </div>
  );
}
