import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';

// Tier 2 — LinkedIn Partner Program required for messaging APIs.
export const linkedinAdapter: ChannelAdapter = {
  provider: 'linkedin',
  async connect() {
    return { error: 'LinkedIn messaging requires Partner Program approval.' };
  },
  async sendMessage(_account: ChannelAccount) {
    throw new Error('linkedin.sendMessage: not yet supported');
  },
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },
};
