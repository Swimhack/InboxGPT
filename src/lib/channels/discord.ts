import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';

export const discordAdapter: ChannelAdapter = {
  provider: 'discord',

  async connect() {
    return { error: 'Not implemented: Discord OAuth lives at /api/auth/oauth/discord.' };
  },

  async sendMessage(account: ChannelAccount, msg) {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error('DISCORD_BOT_TOKEN not set');
    const res = await fetch(`https://discord.com/api/v10/channels/${msg.to}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: msg.bodyText ?? '' }),
    });
    if (!res.ok) throw new Error(`Discord send failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { id?: string };
    return { providerMessageId: json.id };
  },

  normalizeInbound(payload: unknown): NormalizedInbound | null {
    const p = payload as any;
    // Discord Interactions endpoint: type 1 = ping, type 2 = app command, type 3+ = components.
    // DM/message events come via Gateway, not Interactions. This handler normalizes
    // relayed payloads from the bot process (shape: { id, channel_id, author, content, timestamp }).
    if (!p?.id || !p?.author) return null;
    return {
      externalId: p.id,
      providerMessageId: p.id,
      direction: 'inbound',
      receivedAt: p.timestamp ? new Date(p.timestamp) : new Date(),
      from: {
        kind: 'discord_user',
        value: p.author.id,
        display: p.author.username,
      },
      to: [{ kind: 'discord_channel', value: p.channel_id }],
      bodyText: p.content,
      snippet: (p.content || '').slice(0, 180),
      threadKey: `discord:${p.channel_id}`,
      raw: p,
    };
  },
};
