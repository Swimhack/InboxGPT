import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/crypto/encryption';

type SlackCreds = { accessToken: string; botUserId?: string; teamId?: string };

export const slackAdapter: ChannelAdapter = {
  provider: 'slack',

  async connect() {
    return { error: 'Not implemented: Slack install flow lives at /api/auth/oauth/slack.' };
  },

  async sendMessage(account: ChannelAccount, msg) {
    if (!account.credentialsEncrypted) throw new Error('No Slack creds');
    const creds = decryptJSON<SlackCreds>(account.credentialsEncrypted);
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: msg.to, text: msg.bodyText ?? '' }),
    });
    const json = (await res.json()) as { ok?: boolean; ts?: string; error?: string };
    if (!json.ok) throw new Error(`Slack send failed: ${json.error}`);
    return { providerMessageId: json.ts };
  },

  normalizeInbound(payload: unknown): NormalizedInbound | null {
    const p = payload as any;
    // Slack Events API envelope: { event: { type, text, user, channel, ts, ... } }
    const ev = p?.event;
    if (!ev || ev.type !== 'message' || ev.subtype) return null;
    const ts: string = ev.ts;
    return {
      externalId: `${p.team_id}:${ev.channel}:${ts}`,
      providerMessageId: ts,
      direction: 'inbound',
      receivedAt: new Date(Number(ts.split('.')[0]) * 1000),
      from: { kind: 'slack_user', value: ev.user },
      to: [{ kind: 'slack_channel', value: ev.channel }],
      bodyText: ev.text,
      snippet: (ev.text || '').slice(0, 180),
      threadKey: `slack:${ev.channel}`,
      raw: p,
    };
  },
};
