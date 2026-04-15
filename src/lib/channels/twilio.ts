import type { ChannelAdapter, NormalizedInbound } from './types';
import type { ChannelAccount } from '@/lib/db/schema';

// Twilio SMS + Voice (inbound webhooks at /api/webhooks/twilio).
// Phase 1: inbound SMS + voicemail transcript only. Outbound uses Twilio REST.
export const twilioAdapter: ChannelAdapter = {
  provider: 'twilio',

  async connect({ workspaceId, userId }) {
    // Actual Twilio onboarding UI lives in /onboarding/connect-more; this hook is
    // invoked by the settings page after the phone-number picker.
    return { error: 'Not implemented: call /api/channels/twilio/connect instead.' };
  },

  async sendMessage(account: ChannelAccount, msg) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) throw new Error('Twilio env vars missing');
    const body = new URLSearchParams({ From: from, To: msg.to, Body: msg.bodyText ?? '' });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio send failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { sid?: string };
    return { providerMessageId: json.sid };
  },

  normalizeInbound(payload: unknown): NormalizedInbound | null {
    const p = payload as Record<string, string>;
    // Twilio webhooks are x-www-form-urlencoded with MessageSid/From/To/Body.
    if (!p?.MessageSid || !p?.From) return null;
    const isVoicemail = !!p.TranscriptionText || !!p.RecordingSid;
    const bodyText = isVoicemail
      ? p.TranscriptionText || `[Voicemail — transcription pending. Recording: ${p.RecordingUrl}]`
      : p.Body || '';
    return {
      externalId: p.MessageSid,
      providerMessageId: p.MessageSid,
      direction: 'inbound',
      receivedAt: new Date(),
      from: { kind: 'phone', value: p.From },
      to: [{ kind: 'phone', value: p.To }],
      bodyText,
      snippet: bodyText.slice(0, 180),
      threadKey: p.From, // E.164 phone = thread key for SMS/Voice
      raw: p,
    };
  },
};
