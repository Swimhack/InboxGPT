import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';

// Tier 2 — behind feature flag until Meta app review completes.
export const metaIgAdapter: ChannelAdapter = {
  provider: 'meta_ig',
  async connect() {
    return { error: 'Meta IG: pending app review (Advanced Access).' };
  },
  async sendMessage(_account: ChannelAccount) {
    throw new Error('meta_ig.sendMessage: pending approval');
  },
  normalizeInbound(payload: unknown): NormalizedInbound | null {
    const p = payload as any;
    const entry = p?.entry?.[0]?.messaging?.[0];
    if (!entry) return null;
    const mid = entry.message?.mid;
    if (!mid) return null;
    return {
      externalId: mid,
      providerMessageId: mid,
      direction: 'inbound',
      receivedAt: entry.timestamp ? new Date(entry.timestamp) : new Date(),
      from: { kind: 'ig_user', value: entry.sender?.id },
      to: [{ kind: 'ig_user', value: entry.recipient?.id }],
      bodyText: entry.message?.text,
      snippet: (entry.message?.text || '').slice(0, 180),
      threadKey: `ig:${entry.sender?.id}`,
      raw: p,
    };
  },
};

export const metaFbAdapter: ChannelAdapter = {
  provider: 'meta_fb',
  async connect() {
    return { error: 'Meta FB: pending app review (pages_messaging).' };
  },
  async sendMessage(_account: ChannelAccount) {
    throw new Error('meta_fb.sendMessage: pending approval');
  },
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },
};

export const whatsappAdapter: ChannelAdapter = {
  provider: 'whatsapp',
  async connect() {
    return { error: 'WhatsApp Business: pending embedded signup approval.' };
  },
  async sendMessage(_account: ChannelAccount) {
    throw new Error('whatsapp.sendMessage: pending approval');
  },
  normalizeInbound(): NormalizedInbound | null {
    return null;
  },
};
