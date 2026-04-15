import { createHmac, timingSafeEqual } from 'crypto';

export type VerifyResult = { ok: boolean; reason?: string };

/**
 * Twilio: HMAC-SHA1 of the full URL + sorted form params using the auth token.
 * Signature sent in X-Twilio-Signature header, base64-encoded.
 */
export function verifyTwilio(opts: {
  url: string;
  params: Record<string, string>;
  signature: string | null;
  authToken?: string;
}): VerifyResult {
  const authToken = opts.authToken ?? process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return { ok: false, reason: 'TWILIO_AUTH_TOKEN missing' };
  if (!opts.signature) return { ok: false, reason: 'signature missing' };

  const keys = Object.keys(opts.params).sort();
  let data = opts.url;
  for (const k of keys) data += k + opts.params[k];
  const expected = createHmac('sha1', authToken).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  if (a.length !== b.length) return { ok: false, reason: 'length mismatch' };
  return { ok: timingSafeEqual(a, b) };
}

/**
 * Slack: v0:{timestamp}:{rawBody} → HMAC-SHA256 with signing secret.
 * Signature prefixed `v0=` in X-Slack-Signature. Enforce ±5 min skew.
 */
export function verifySlack(opts: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret?: string;
}): VerifyResult {
  const secret = opts.signingSecret ?? process.env.SLACK_SIGNING_SECRET;
  if (!secret) return { ok: false, reason: 'SLACK_SIGNING_SECRET missing' };
  if (!opts.timestamp || !opts.signature) return { ok: false, reason: 'missing ts/sig' };

  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad timestamp' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 60 * 5) return { ok: false, reason: 'timestamp skew' };

  const base = `v0:${opts.timestamp}:${opts.rawBody}`;
  const expected = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  if (a.length !== b.length) return { ok: false, reason: 'length mismatch' };
  return { ok: timingSafeEqual(a, b) };
}

/**
 * Discord Interactions endpoint: Ed25519 over `${timestamp}${rawBody}`.
 * Uses tweetnacl if available; falls back to returning ok:false with a clear
 * error so routes can return 401 until the dep is installed.
 */
export async function verifyDiscord(opts: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  publicKey?: string;
}): Promise<VerifyResult> {
  const pub = opts.publicKey ?? process.env.DISCORD_PUBLIC_KEY;
  if (!pub) return { ok: false, reason: 'DISCORD_PUBLIC_KEY missing' };
  if (!opts.timestamp || !opts.signature) return { ok: false, reason: 'missing ts/sig' };

  try {
    const nacl = (await import('tweetnacl')).default;
    const ok = nacl.sign.detached.verify(
      Buffer.from(opts.timestamp + opts.rawBody),
      Buffer.from(opts.signature, 'hex'),
      Buffer.from(pub, 'hex')
    );
    return { ok };
  } catch (err) {
    return { ok: false, reason: `tweetnacl unavailable: ${(err as Error).message}` };
  }
}

/**
 * Meta (Facebook/Instagram/WhatsApp) webhooks: X-Hub-Signature-256 HMAC-SHA256.
 */
export function verifyMeta(opts: {
  rawBody: string;
  signature: string | null;
  appSecret?: string;
}): VerifyResult {
  const secret = opts.appSecret ?? process.env.META_APP_SECRET;
  if (!secret) return { ok: false, reason: 'META_APP_SECRET missing' };
  if (!opts.signature) return { ok: false, reason: 'signature missing' };
  const expected = `sha256=${createHmac('sha256', secret).update(opts.rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  if (a.length !== b.length) return { ok: false, reason: 'length mismatch' };
  return { ok: timingSafeEqual(a, b) };
}
