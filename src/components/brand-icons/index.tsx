import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

export function GmailIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M22 5.5v13a1.5 1.5 0 0 1-1.5 1.5H18V8.99l-6 4.5-6-4.5V20H3.5A1.5 1.5 0 0 1 2 18.5v-13A1.5 1.5 0 0 1 3.5 4h.75L12 9.75 19.75 4h.75A1.5 1.5 0 0 1 22 5.5z" fill="#EA4335" />
      <path d="M6 20v-11l6 4.5 6-4.5V20h-3v-7l-3 2.25L9 13v7H6z" fill="#FBBC04" />
      <path d="M18 8.99v11h2.5a1.5 1.5 0 0 0 1.5-1.5V5.5L18 8.99z" fill="#34A853" />
      <path d="M2 5.5v13A1.5 1.5 0 0 0 3.5 20H6V9l-4-3.5z" fill="#4285F4" />
    </svg>
  );
}

export function OutlookIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="5" width="14" height="14" rx="1" fill="#0078D4" />
      <path d="M9 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="#fff" />
      <path d="M16 9v7h5.5a.5.5 0 0 0 .5-.5V9l-3 2-3-2z" fill="#50D9FF" />
      <path d="M22 8.5V9l-3 2-3-2v-.5l3-2 3 2z" fill="#28A8EA" />
    </svg>
  );
}

export function ImapIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" fill="#6B7280" />
      <path d="M2 7l10 6 10-6" stroke="#fff" strokeWidth="1.5" fill="none" />
      <text x="12" y="17" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#fff">IMAP</text>
    </svg>
  );
}

export function SlackIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M5 14a2 2 0 1 1 0-4h2v4H5z" fill="#36C5F0" />
      <path d="M8 14a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5z" fill="#36C5F0" />
      <path d="M10 5a2 2 0 1 1 4 0v2h-4V5z" fill="#2EB67D" />
      <path d="M10 8h5a2 2 0 1 1 0 4h-5V8z" fill="#2EB67D" />
      <path d="M19 10a2 2 0 1 1 0 4h-2v-4h2z" fill="#ECB22E" />
      <path d="M16 10a2 2 0 1 1-4 0V5a2 2 0 1 1 4 0v5z" fill="#ECB22E" />
      <path d="M14 19a2 2 0 1 1-4 0v-2h4v2z" fill="#E01E5A" />
      <path d="M14 16H9a2 2 0 1 1 0-4h5v4z" fill="#E01E5A" />
    </svg>
  );
}

export function DiscordIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M19.3 5.4A16 16 0 0 0 15.4 4l-.2.4a14.5 14.5 0 0 0-6.4 0L8.6 4a16 16 0 0 0-3.9 1.4C1.7 9.9.9 14.3 1.3 18.7a16 16 0 0 0 4.9 2.5l1-1.4c-.9-.3-1.7-.7-2.5-1.2l.5-.3a11.5 11.5 0 0 0 9.6 0l.5.3c-.8.5-1.6.9-2.5 1.2l1 1.4c1.8-.5 3.4-1.4 4.9-2.5.5-4.8-.4-9.2-3.4-13.3zM9 16.1c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" fill="#5865F2" />
    </svg>
  );
}

export function TwilioIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="12" r="10" fill="#F22F46" />
      <circle cx="9" cy="9" r="1.8" fill="#fff" />
      <circle cx="15" cy="9" r="1.8" fill="#fff" />
      <circle cx="9" cy="15" r="1.8" fill="#fff" />
      <circle cx="15" cy="15" r="1.8" fill="#fff" />
    </svg>
  );
}

export function MetaFbIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="12" r="10" fill="#1877F2" />
      <path d="M13.5 22v-7.5h2.5l.4-3h-2.9v-2c0-.9.3-1.5 1.5-1.5h1.5V5.2C16.2 5.1 15.3 5 14.3 5c-2.1 0-3.5 1.3-3.5 3.7v2.1H8v3h2.8V22h2.7z" fill="#fff" />
    </svg>
  );
}

export function MetaIgIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F58529" />
          <stop offset="50%" stopColor="#DD2A7B" />
          <stop offset="100%" stopColor="#8134AF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad)" />
      <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.7" fill="none" />
      <circle cx="17" cy="7" r="1" fill="#fff" />
    </svg>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="12" r="10" fill="#25D366" />
      <path d="M16.5 13.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-.8-.3-1.6-.9-2.2-1.6-.2-.2-.2-.3 0-.5l.4-.5c.1-.1.1-.2.1-.4l-.6-1.5c-.1-.2-.2-.2-.4-.2h-.5c-.2 0-.4.1-.5.2-.6.5-.8 1.3-.6 2.1.4 1.5 1.5 2.8 2.9 3.5.3.2.7.3 1 .4.4.1.8.1 1.1 0 .4-.1.8-.4 1-.8.2-.3.2-.6.1-.8l-.4-.2z" fill="#fff" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="3" fill="#000" />
      <path d="M17 5h2l-4.5 5.1L20 19h-4.2l-3.3-4.3L8.4 19H6.4l4.8-5.5L6 5h4.3l3 4 3.7-4z" fill="#fff" />
    </svg>
  );
}

export function LinkedInIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#0A66C2" />
      <rect x="5" y="9" width="2.6" height="8" fill="#fff" />
      <circle cx="6.3" cy="6.7" r="1.5" fill="#fff" />
      <path d="M10 9h2.5v1.1c.3-.5 1.1-1.2 2.3-1.2 2.5 0 3 1.6 3 3.7V17h-2.6v-3.8c0-.9 0-2-1.3-2-1.3 0-1.5 1-1.5 2V17H10V9z" fill="#fff" />
    </svg>
  );
}

export function SignalIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="12" r="10" fill="#3A76F0" />
      <path d="M12 5a7 7 0 0 0-6 10.5L5 19l3.5-1A7 7 0 1 0 12 5z" fill="#fff" />
    </svg>
  );
}

export const BrandIcons = {
  gmail: GmailIcon,
  outlook: OutlookIcon,
  imap: ImapIcon,
  slack: SlackIcon,
  discord: DiscordIcon,
  twilio: TwilioIcon,
  meta_fb: MetaFbIcon,
  meta_ig: MetaIgIcon,
  whatsapp: WhatsAppIcon,
  x: XIcon,
  linkedin: LinkedInIcon,
  signal: SignalIcon,
} as const;

export type BrandIconKey = keyof typeof BrandIcons;
