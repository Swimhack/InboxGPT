import type { BrandIconKey } from '@/components/brand-icons';

export type ChannelProvider =
  | 'gmail'
  | 'outlook'
  | 'imap'
  | 'twilio'
  | 'slack'
  | 'discord'
  | 'meta_ig'
  | 'meta_fb'
  | 'whatsapp'
  | 'x'
  | 'linkedin'
  | 'signal';

export type ChannelCategory = 'email' | 'chat' | 'sms' | 'social';

export type ConnectStrategy =
  | { kind: 'oauth'; initiatePath: string }
  | { kind: 'imap-dialog' }
  | { kind: 'install-doc'; docUrl: string; webhookPath: string }
  | { kind: 'coming-soon'; reason?: string };

export interface ChannelDef {
  id: ChannelProvider;
  name: string;
  description: string;
  category: ChannelCategory;
  iconKey: BrandIconKey;
  strategy: ConnectStrategy;
}

export const CHANNEL_CATEGORIES: Array<{ id: ChannelCategory; label: string }> = [
  { id: 'email', label: 'Email' },
  { id: 'chat', label: 'Team chat' },
  { id: 'sms', label: 'SMS & voice' },
  { id: 'social', label: 'Social & messaging' },
];

export const CHANNEL_CATALOG: ChannelDef[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Sync messages from any Google Workspace or personal Gmail account.',
    category: 'email',
    iconKey: 'gmail',
    strategy: { kind: 'oauth', initiatePath: '/api/auth/oauth/gmail' },
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Connect Microsoft 365 or Outlook.com inboxes via OAuth.',
    category: 'email',
    iconKey: 'outlook',
    strategy: { kind: 'oauth', initiatePath: '/api/auth/oauth/outlook' },
  },
  {
    id: 'imap',
    name: 'IMAP / SMTP',
    description: 'Any email provider with IMAP access — iCloud, Yahoo, Fastmail, self-hosted.',
    category: 'email',
    iconKey: 'imap',
    strategy: { kind: 'imap-dialog' },
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Forward Slack DMs and mentions into your unified inbox.',
    category: 'chat',
    iconKey: 'slack',
    strategy: {
      kind: 'install-doc',
      docUrl: 'https://api.slack.com/apps',
      webhookPath: '/api/webhooks/slack',
    },
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Capture Discord DMs and server mentions via bot integration.',
    category: 'chat',
    iconKey: 'discord',
    strategy: {
      kind: 'install-doc',
      docUrl: 'https://discord.com/developers/applications',
      webhookPath: '/api/webhooks/discord',
    },
  },
  {
    id: 'signal',
    name: 'Signal',
    description: 'Route Signal messages through a self-hosted bridge.',
    category: 'chat',
    iconKey: 'signal',
    strategy: { kind: 'coming-soon', reason: 'Available in the next release.' },
  },
  {
    id: 'twilio',
    name: 'Twilio SMS',
    description: 'Receive SMS and voicemail transcripts through Twilio webhooks.',
    category: 'sms',
    iconKey: 'twilio',
    strategy: { kind: 'coming-soon', reason: 'Credential form ships in the next release.' },
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Connect a WhatsApp Business number to your inbox.',
    category: 'sms',
    iconKey: 'whatsapp',
    strategy: { kind: 'coming-soon', reason: 'Requires WhatsApp Business approval.' },
  },
  {
    id: 'meta_ig',
    name: 'Instagram DMs',
    description: 'Read and reply to Instagram Direct Messages from the inbox.',
    category: 'social',
    iconKey: 'meta_ig',
    strategy: { kind: 'coming-soon', reason: 'Awaiting Meta app review.' },
  },
  {
    id: 'meta_fb',
    name: 'Facebook Messenger',
    description: 'Answer Facebook Page messages alongside your email.',
    category: 'social',
    iconKey: 'meta_fb',
    strategy: { kind: 'coming-soon', reason: 'Awaiting Meta app review.' },
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    description: 'Capture X DMs and mentions in the unified inbox.',
    category: 'social',
    iconKey: 'x',
    strategy: { kind: 'coming-soon', reason: 'Requires X Enterprise API tier.' },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Route LinkedIn messages and InMail into your inbox.',
    category: 'social',
    iconKey: 'linkedin',
    strategy: { kind: 'coming-soon', reason: 'Requires LinkedIn Partner approval.' },
  },
];
