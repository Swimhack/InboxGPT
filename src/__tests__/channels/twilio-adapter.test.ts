/**
 * @jest-environment node
 *
 * Unit tests for the Twilio channel adapter (STR-1129 Tier-1 cutover).
 *
 * Covers:
 *  - twilioAdapter: connect, sendMessage, normalizeInbound
 *  - POST /api/webhooks/twilio: valid sig → 200, invalid → 403, duplicate dedup
 *  - POST /api/channels/twilio/connect: happy path, duplicate, missing config
 */

// ── global mocks ──────────────────────────────────────────────────────────────

// Stub fetch globally for Twilio REST calls
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn().mockResolvedValue({ user: { id: 'user-uuid' } }),
}));
jest.mock('@/lib/auth/workspace', () => ({
  getWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-uuid', userId: 'user-uuid' }),
}));

// DB mock
const insertedRows: unknown[] = [];
const selectRows: unknown[][] = [];

jest.mock('@/lib/db', () => {
  const schema = {
    channelAccounts: {
      id: 'id',
      workspaceId: 'workspace_id',
      provider: 'provider',
      externalAccountId: 'external_account_id',
    },
    jobs: { type: 'type', workspaceId: 'workspace_id', data: 'data', priority: 'priority' },
    webhookEvents: {
      id: 'id',
      provider: 'provider',
      externalEventId: 'external_event_id',
    },
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(selectRows.shift() ?? []),
        limit: () => ({ where: () => Promise.resolve(selectRows.shift() ?? []) }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            insertedRows.push(v);
            return Promise.resolve([{ id: 'new-id' }]);
          },
          target: () => ({
            returning: () => {
              insertedRows.push(v);
              return Promise.resolve([{ id: 'new-id' }]);
            },
          }),
        }),
        returning: () => {
          insertedRows.push(v);
          return Promise.resolve([{ id: 'new-acct-id' }]);
        },
      }),
    }),
  };
  return { db, schema };
});

jest.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
  sql: (s: unknown) => s,
}));

// ── twilio adapter tests ──────────────────────────────────────────────────────

import { twilioAdapter } from '@/lib/channels/twilio';
import type { ChannelAccount } from '@/lib/db/schema';

function makeAccount(overrides: Partial<ChannelAccount> = {}): ChannelAccount {
  return {
    id: 'acct-twilio',
    workspaceId: 'ws-1',
    userId: 'user-1',
    provider: 'twilio',
    externalAccountId: '+15551234567',
    displayName: 'SMS Line',
    status: 'active',
    credentialsEncrypted: null,
    lastSyncAt: null,
    lastError: null,
    accessTokenExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ChannelAccount;
}

describe('twilioAdapter', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    insertedRows.length = 0;
    selectRows.length = 0;
    process.env = {
      ...origEnv,
      TWILIO_ACCOUNT_SID: 'ACtest123',
      TWILIO_AUTH_TOKEN: 'authtoken123',
      TWILIO_PHONE_NUMBER: '+15550000000',
    };
  });

  afterAll(() => {
    process.env = origEnv;
  });

  // ── connect ────────────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('returns an error directing to the connect route', async () => {
      const result = await twilioAdapter.connect({ workspaceId: 'ws-1', userId: 'u-1' });
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toMatch(/twilio\/connect/i);
    });
  });

  // ── sendMessage ────────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('POSTs to Twilio Messages.json and returns providerMessageId', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sid: 'SM123abc' }),
      });

      const result = await twilioAdapter.sendMessage(makeAccount(), {
        to: '+15559876543',
        bodyText: 'Hello from InboxGPT',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/Accounts/ACtest123/Messages.json'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.providerMessageId).toBe('SM123abc');
    });

    it('throws when Twilio env vars are missing', async () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      await expect(
        twilioAdapter.sendMessage(makeAccount(), { to: '+1555', bodyText: 'hi' })
      ).rejects.toThrow(/Twilio env vars missing/);
    });

    it('throws when Twilio API returns an error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      });

      await expect(
        twilioAdapter.sendMessage(makeAccount(), { to: '+15559876543', bodyText: 'test' })
      ).rejects.toThrow(/Twilio send failed: 429/);
    });
  });

  // ── normalizeInbound ───────────────────────────────────────────────────────

  describe('normalizeInbound()', () => {
    it('returns null for empty / invalid payload', () => {
      expect(twilioAdapter.normalizeInbound(null)).toBeNull();
      expect(twilioAdapter.normalizeInbound({})).toBeNull();
      expect(twilioAdapter.normalizeInbound({ From: '+1555' })).toBeNull(); // no MessageSid
    });

    it('normalizes a standard inbound SMS', () => {
      const payload = {
        MessageSid: 'SM_inbound_001',
        From: '+15551234567',
        To: '+15550000000',
        Body: 'Hey there!',
      };

      const normalized = twilioAdapter.normalizeInbound(payload);

      expect(normalized).not.toBeNull();
      expect(normalized!.externalId).toBe('SM_inbound_001');
      expect(normalized!.providerMessageId).toBe('SM_inbound_001');
      expect(normalized!.direction).toBe('inbound');
      expect(normalized!.from).toEqual({ kind: 'phone', value: '+15551234567' });
      expect(normalized!.to).toEqual([{ kind: 'phone', value: '+15550000000' }]);
      expect(normalized!.bodyText).toBe('Hey there!');
      expect(normalized!.snippet).toBe('Hey there!');
      expect(normalized!.threadKey).toBe('+15551234567');
      expect(normalized!.raw).toEqual(payload);
    });

    it('uses TranscriptionText for voicemail payloads', () => {
      const payload = {
        MessageSid: 'SM_vm_001',
        From: '+15551111111',
        To: '+15550000000',
        TranscriptionText: 'Please call me back when you can.',
        RecordingSid: 'RE_001',
        RecordingUrl: 'https://api.twilio.com/recordings/RE_001',
      };

      const normalized = twilioAdapter.normalizeInbound(payload)!;
      expect(normalized.bodyText).toBe('Please call me back when you can.');
    });

    it('falls back to recording URL when transcription is missing for voicemail', () => {
      const payload = {
        MessageSid: 'SM_vm_002',
        From: '+15551111111',
        To: '+15550000000',
        RecordingSid: 'RE_002',
        RecordingUrl: 'https://api.twilio.com/recordings/RE_002',
      };

      const normalized = twilioAdapter.normalizeInbound(payload)!;
      expect(normalized.bodyText).toContain('Voicemail');
      expect(normalized.bodyText).toContain('RE_002');
    });

    it('threadKey equals the From E.164 number for SMS thread dedup', () => {
      const p = { MessageSid: 'SM1', From: '+15559999999', To: '+15550000000', Body: 'hi' };
      const normalized = twilioAdapter.normalizeInbound(p)!;
      expect(normalized.threadKey).toBe('+15559999999');
    });

    it('snippet is truncated to 180 chars', () => {
      const longBody = 'a'.repeat(300);
      const p = { MessageSid: 'SM2', From: '+1555', To: '+1555', Body: longBody };
      const normalized = twilioAdapter.normalizeInbound(p)!;
      expect(normalized.snippet!.length).toBeLessThanOrEqual(180);
    });
  });
});

// ── webhook route tests ───────────────────────────────────────────────────────

import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

// Mock the enqueue helpers so no DB calls fire in the webhook test
jest.mock('@/lib/webhooks/enqueue', () => ({
  recordWebhookEvent: jest.fn().mockResolvedValue({ eventId: 'evt-1', duplicate: false }),
  enqueueNormalizeInbound: jest.fn().mockResolvedValue(undefined),
}));

function makeSignature(url: string, params: Record<string, string>, authToken: string): string {
  const keys = Object.keys(params).sort();
  let data = url;
  for (const k of keys) data += k + params[k];
  return createHmac('sha1', authToken).update(data).digest('base64');
}

describe('POST /api/webhooks/twilio', () => {
  const WEBHOOK_URL = 'https://inboxgpt.fly.dev/api/webhooks/twilio';
  const AUTH_TOKEN = 'authtoken123';

  const smsParams: Record<string, string> = {
    MessageSid: 'SM_test_sig',
    From: '+15551234567',
    To: '+15550000000',
    Body: 'Test message',
  };

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    jest.clearAllMocks();
  });

  async function callWebhook(params: Record<string, string>, sig: string | null) {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    const body = new URLSearchParams(params).toString();
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (sig !== null) headers['x-twilio-signature'] = sig;
    const req = new NextRequest(new URL(WEBHOOK_URL), { method: 'POST', body, headers });
    return POST(req);
  }

  it('returns 200 for a valid HMAC-SHA1 signature', async () => {
    const sig = makeSignature(WEBHOOK_URL, smsParams, AUTH_TOKEN);
    const res = await callWebhook(smsParams, sig);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 403 for an invalid signature', async () => {
    const res = await callWebhook(smsParams, 'invalidsignature==');
    expect(res.status).toBe(403);
  });

  it('returns 403 when signature header is missing', async () => {
    const res = await callWebhook(smsParams, null);
    expect(res.status).toBe(403);
  });

  it('marks duplicate:true on repeated delivery of the same MessageSid', async () => {
    const { recordWebhookEvent } = await import('@/lib/webhooks/enqueue');
    (recordWebhookEvent as jest.Mock).mockResolvedValueOnce({ eventId: 'evt-dup', duplicate: true });

    const sig = makeSignature(WEBHOOK_URL, smsParams, AUTH_TOKEN);
    const res = await callWebhook(smsParams, sig);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
  });

  it('does not call enqueueNormalizeInbound on duplicate events', async () => {
    const { recordWebhookEvent, enqueueNormalizeInbound } = await import('@/lib/webhooks/enqueue');
    (recordWebhookEvent as jest.Mock).mockResolvedValueOnce({ eventId: 'evt-dup', duplicate: true });

    const sig = makeSignature(WEBHOOK_URL, smsParams, AUTH_TOKEN);
    await callWebhook(smsParams, sig);
    expect(enqueueNormalizeInbound).not.toHaveBeenCalled();
  });
});

// ── /api/channels/twilio/connect tests ────────────────────────────────────────

describe('POST /api/channels/twilio/connect', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    insertedRows.length = 0;
    selectRows.length = 0;
    process.env = {
      ...origEnv,
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'tok',
      TWILIO_PHONE_NUMBER: '+15550000000',
    };
  });

  afterAll(() => {
    process.env = origEnv;
  });

  async function call(body: unknown) {
    const { POST } = await import('@/app/api/channels/twilio/connect/route');
    const req = new NextRequest(new URL('https://app.com/api/channels/twilio/connect'), {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it('creates a channelAccount using the env var phone number when none is supplied', async () => {
    selectRows.push([]); // duplicate check returns empty

    const res = await call({});
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.phoneNumber).toBe('+15550000000');
    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0] as Record<string, unknown>;
    expect(row.provider).toBe('twilio');
    expect(row.externalAccountId).toBe('+15550000000');
    expect(row.workspaceId).toBe('ws-uuid');
    // No Phase 0 columns
    expect(row).not.toHaveProperty('encryptedAccessToken');
  });

  it('normalises phone number to E.164 (adds + prefix) and verifies with Twilio', async () => {
    // Mock the Twilio verify API call first (before calling the route)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ incoming_phone_numbers: [{ phone_number: '+15551111111' }] }),
    });
    selectRows.push([]); // dup check returns empty

    const res = await call({ phoneNumber: '15551111111' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.phoneNumber).toBe('+15551111111');
    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0] as Record<string, unknown>;
    expect(row.externalAccountId).toBe('+15551111111');
  });

  it('returns 503 when Twilio env vars are missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    const res = await call({});
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('twilio_not_configured');
  });

  it('returns 400 when no phone number in body and TWILIO_PHONE_NUMBER not set', async () => {
    delete process.env.TWILIO_PHONE_NUMBER;
    const res = await call({});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('phone_number_required');
  });

  it('returns 409 when phone number already connected', async () => {
    selectRows.push([{ id: 'existing-acct' }]); // dup check finds existing
    const res = await call({});
    expect(res.status).toBe(409);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getSession } = await import('@/lib/auth/session');
    (getSession as jest.Mock).mockResolvedValueOnce(null);
    const res = await call({});
    expect(res.status).toBe(401);
  });
});
