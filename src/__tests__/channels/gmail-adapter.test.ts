/**
 * Unit tests for the Gmail channel adapter (Tier-1 cutover).
 *
 * Covers: connect stub, sendMessage (Gmail REST API), normalizeInbound,
 * sync() hook, and token refresh.
 * All I/O (fetch, processEmailSync, refreshGoogleToken) is mocked.
 */

// ── module-level mocks (hoisted before imports) ──────────────────────────────

const processEmailSyncMock = jest.fn();
jest.mock('@/lib/queue/processors', () => ({
  processEmailSync: (...args: unknown[]) => processEmailSyncMock(...args),
}));

jest.mock('@/lib/crypto/encryption', () => ({
  decryptJSON: (buf: unknown) => JSON.parse((buf as Buffer).toString()),
  encryptJSON: (v: unknown) => Buffer.from(JSON.stringify(v)),
}));

const refreshGoogleTokenMock = jest.fn();
jest.mock('@/lib/email/token-refresh', () => ({
  refreshGoogleToken: (...args: unknown[]) => refreshGoogleTokenMock(...args),
}));

const dbSetMock = jest.fn();
const dbWhereMock = jest.fn();
jest.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (vals: unknown) => {
        dbSetMock(vals);
        return { where: dbWhereMock };
      },
    }),
  },
  schema: { channelAccounts: { id: 'id' } },
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import { gmailAdapter } from '@/lib/channels/gmail';
import type { ChannelAccount } from '@/lib/db/schema';
import type { OutboundMessage } from '@/lib/channels/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCreds(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: 'tok_access',
    refreshToken: 'tok_refresh',
    expiresAt: Date.now() + 3600 * 1000, // valid for 1 hour
    ...overrides,
  };
}

function makeAccount(overrides: Partial<ChannelAccount> = {}): ChannelAccount {
  const creds = makeCreds();
  return {
    id: 'acct-gmail-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    provider: 'gmail',
    externalAccountId: 'user@example.com',
    displayName: 'Test User',
    status: 'active',
    credentialsEncrypted: Buffer.from(JSON.stringify(creds)),
    lastSyncAt: null,
    lastError: null,
    accessTokenExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ChannelAccount;
}

function makeMsg(overrides: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    to: 'recipient@example.com',
    subject: 'Hello',
    bodyText: 'Test message body',
    ...overrides,
  };
}

function makeSendResponse(msgId = 'gmail-msg-123', threadId = 'thread-abc') {
  return { id: msgId, threadId };
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(makeSendResponse()),
    text: jest.fn().mockResolvedValue(''),
  });
  processEmailSyncMock.mockResolvedValue({ newEmailCount: 3, totalFetched: 10 });
});

// ── connect ───────────────────────────────────────────────────────────────────

describe('connect', () => {
  it('returns an error (Google OAuth is handled upstream)', async () => {
    const result = await gmailAdapter.connect({ workspaceId: 'ws-1', userId: 'user-1' });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/Google sign-in/i);
  });

  it('returns error when workspaceId missing', async () => {
    const result = await gmailAdapter.connect({ workspaceId: '', userId: 'user-1' });
    expect(result).toHaveProperty('error');
  });
});

// ── normalizeInbound ──────────────────────────────────────────────────────────

describe('normalizeInbound', () => {
  it('returns null (pull-only, no webhook normalization needed)', () => {
    expect(gmailAdapter.normalizeInbound({ anything: true })).toBeNull();
  });
});

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('sends a plain-text email and returns providerMessageId', async () => {
    const account = makeAccount();
    const msg = makeMsg();

    const result = await gmailAdapter.sendMessage(account, msg);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok_access');

    const body = JSON.parse(init.body);
    expect(body.raw).toBeDefined();
    // Decode base64url and verify headers
    const decoded = Buffer.from(body.raw, 'base64url').toString();
    expect(decoded).toContain('From: user@example.com');
    expect(decoded).toContain('To: recipient@example.com');
    expect(decoded).toContain('Subject: Hello');

    expect(result.providerMessageId).toBe('gmail-msg-123');
  });

  it('sends an HTML email with multipart/alternative body', async () => {
    const account = makeAccount();
    const msg = makeMsg({ bodyHtml: '<p>Hello</p>', bodyText: 'Hello' });

    await gmailAdapter.sendMessage(account, msg);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const decoded = Buffer.from(body.raw, 'base64url').toString();
    expect(decoded).toContain('multipart/alternative');
    expect(decoded).toContain('text/plain');
    expect(decoded).toContain('text/html');
    expect(decoded).toContain('<p>Hello</p>');
  });

  it('sends HTML-only email', async () => {
    const account = makeAccount();
    const msg = makeMsg({ bodyHtml: '<b>Bold</b>', bodyText: undefined });

    await gmailAdapter.sendMessage(account, msg);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const decoded = Buffer.from(body.raw, 'base64url').toString();
    expect(decoded).toContain('text/html');
    expect(decoded).toContain('<b>Bold</b>');
  });

  it('includes In-Reply-To header when inReplyTo provided', async () => {
    const account = makeAccount();
    const msg = makeMsg({ inReplyTo: '<original-id@example.com>' });

    await gmailAdapter.sendMessage(account, msg);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const decoded = Buffer.from(body.raw, 'base64url').toString();
    expect(decoded).toContain('In-Reply-To: <original-id@example.com>');
    expect(decoded).toContain('References: <original-id@example.com>');
  });

  it('refreshes token when expired before sending', async () => {
    const expiredCreds = makeCreds({ expiresAt: Date.now() - 1000 });
    const account = makeAccount({
      credentialsEncrypted: Buffer.from(JSON.stringify(expiredCreds)) as unknown as Buffer,
    });
    refreshGoogleTokenMock.mockResolvedValue({ accessToken: 'tok_new', expiresAt: Date.now() + 3600000 });

    await gmailAdapter.sendMessage(account, makeMsg());

    expect(refreshGoogleTokenMock).toHaveBeenCalledWith('tok_refresh');
    expect(dbSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialsEncrypted: expect.anything(),
      })
    );
    // Verify the refreshed token was used
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok_new');
  });

  it('throws when the API returns a non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue('Forbidden'),
    });
    const account = makeAccount();

    await expect(gmailAdapter.sendMessage(account, makeMsg())).rejects.toThrow(
      /Gmail send failed \(403\)/
    );
  });

  it('throws when account has no credentials', async () => {
    const account = makeAccount({ credentialsEncrypted: null } as unknown as Partial<ChannelAccount>);
    await expect(gmailAdapter.sendMessage(account, makeMsg())).rejects.toThrow(
      /no credentials/
    );
  });
});

// ── sync ──────────────────────────────────────────────────────────────────────

describe('sync', () => {
  it('delegates to processEmailSync with incremental type', async () => {
    const account = makeAccount();
    const result = await gmailAdapter.sync!(account);

    expect(processEmailSyncMock).toHaveBeenCalledWith({
      accountId: 'acct-gmail-1',
      type: 'incremental',
    });
    expect(result.inserted).toBe(3);
  });

  it('propagates processEmailSync errors', async () => {
    processEmailSyncMock.mockRejectedValue(new Error('network timeout'));
    await expect(gmailAdapter.sync!(makeAccount())).rejects.toThrow('network timeout');
  });
});
