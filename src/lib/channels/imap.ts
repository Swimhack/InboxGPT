import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';

export const imapAdapter: ChannelAdapter = {
  provider: 'imap',
  async connect() {
    return { error: 'IMAP connect lives at /api/accounts (existing flow).' };
  },
  async sendMessage(_account: ChannelAccount) {
    throw new Error('imap.sendMessage: not yet wired through unified adapter.');
  },
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },
};
