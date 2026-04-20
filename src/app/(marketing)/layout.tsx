import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'InboxGPT',
  description: 'Unified inbox with AI-powered email management.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
