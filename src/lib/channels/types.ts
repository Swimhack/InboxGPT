import type { ChannelAccount, NewMessage } from '@/lib/db/schema';

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

export type OutboundMessage = {
  to: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: Buffer }>;
};

export type NormalizedInbound = {
  externalId: string;
  providerMessageId: string;
  direction: 'inbound' | 'outbound';
  receivedAt: Date;
  sentAt?: Date;
  from: { kind: string; value: string; display?: string };
  to: Array<{ kind: string; value: string; display?: string }>;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  threadKey?: string; // participant key used for dedupe/threading
  raw: unknown;
};

export interface ChannelAdapter {
  provider: ChannelProvider;

  /** Hydrate credentials or test the connection. Returns a channel_account row on success. */
  connect(args: {
    workspaceId: string;
    userId: string;
    [k: string]: unknown;
  }): Promise<{ channelAccountId: string } | { error: string }>;

  /** Send a message via the provider. Returns provider_message_id when available. */
  sendMessage(
    account: ChannelAccount,
    msg: OutboundMessage
  ): Promise<{ providerMessageId?: string }>;

  /** Convert a raw inbound webhook payload into our canonical message shape. */
  normalizeInbound(payload: unknown, account?: ChannelAccount | null): NormalizedInbound | null;

  /** Optional backfill/polling hook used by *-sync workers. */
  sync?(account: ChannelAccount): Promise<{ inserted: number; nextCursor?: unknown }>;
}

export type NewMessageFromNormalized = (
  workspaceId: string,
  channelAccountId: string,
  n: NormalizedInbound
) => NewMessage;
