import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';

// Thin adapter over existing email code; full inbound normalization stays in
// workers/email-sync.worker.ts for now and will be migrated in Phase 2.
export const gmailAdapter: ChannelAdapter = {
  provider: 'gmail',

  async connect() {
    return { error: 'Gmail connects zero-click via Google sign-in (see src/lib/auth/config.ts).' };
  },

  async sendMessage(_account: ChannelAccount, _msg) {
    // TODO(phase1): wire to src/lib/email/smtp-client.ts / Gmail send API.
    throw new Error('gmail.sendMessage: not yet wired through unified adapter.');
  },

  normalizeInbound(): NormalizedInbound | null {
    // Gmail pushes via IMAP IDLE/polling, not webhooks — normalization stays in the sync worker.
    return null;
  },
};
