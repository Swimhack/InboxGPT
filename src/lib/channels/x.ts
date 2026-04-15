import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';

// Tier 2 — X DM webhooks require Enterprise API tier. Adapter is stubbed.
export const xAdapter: ChannelAdapter = {
  provider: 'x',
  async connect() {
    return { error: 'X DMs require the paid Enterprise API tier.' };
  },
  async sendMessage(_account: ChannelAccount) {
    throw new Error('x.sendMessage: not yet supported');
  },
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },
};
