import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';

export const outlookAdapter: ChannelAdapter = {
  provider: 'outlook',
  async connect() {
    return { error: 'Outlook connects zero-click via Microsoft sign-in.' };
  },
  async sendMessage(_account: ChannelAccount) {
    throw new Error('outlook.sendMessage: not yet wired through unified adapter.');
  },
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },
};
