import type { ChannelAdapter, ChannelProvider } from './types';
import { gmailAdapter } from './gmail';
import { outlookAdapter } from './outlook';
import { imapAdapter } from './imap';
import { twilioAdapter } from './twilio';
import { slackAdapter } from './slack';
import { discordAdapter } from './discord';
import { metaFbAdapter, metaIgAdapter, whatsappAdapter } from './meta';
import { xAdapter } from './x';
import { linkedinAdapter } from './linkedin';

export const adapters: Record<ChannelProvider, ChannelAdapter> = {
  gmail: gmailAdapter,
  outlook: outlookAdapter,
  imap: imapAdapter,
  twilio: twilioAdapter,
  slack: slackAdapter,
  discord: discordAdapter,
  meta_ig: metaIgAdapter,
  meta_fb: metaFbAdapter,
  whatsapp: whatsappAdapter,
  x: xAdapter,
  linkedin: linkedinAdapter,
  signal: {
    provider: 'signal',
    async connect() {
      return { error: 'Signal adapter not yet implemented' };
    },
    async sendMessage() {
      throw new Error('Signal adapter not yet implemented');
    },
    normalizeInbound() {
      return null;
    },
  },
};

export function getAdapter(provider: ChannelProvider): ChannelAdapter {
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`No adapter for provider: ${provider}`);
  return adapter;
}

export type { ChannelAdapter, ChannelProvider, NormalizedInbound, OutboundMessage } from './types';
