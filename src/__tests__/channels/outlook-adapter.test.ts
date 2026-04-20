/**
 * Unit tests for the Outlook channel adapter (Tier-1 cutover).
 *
 * Covers: connect stub, sendMessage (Graph API), normalizeInbound, and sync() hook.
 * All I/O (fetch, processEmailSync, refreshMicrosoftToken) is mocked so no real
 * network calls occur.
 */

// ── module-level mocks (hoisted before imports) ───────────────────────────

const processEmailSyncMock = jest.fn();
jest.mock('@/lib/queue/processors', () => ({
  processEmailSync: (...args: unknown[]) => processEmailSyncMock(...args),
}));

jest.mock('@/lib/crypto/encryption', () => ({
  decryptJSON: (buf: unknown) => JSON.parse((buf as Buffer).toString()),
  encryptJSON: (v: unknown) => Buffer.from(JSON.stringify(v)),
}));

const refreshMicrosoftTokenMock = jest.fn();
jest.mock('@/lib/email/token-refresh', () => ({
  refreshMicrosoftToken: (...args: unknown[]) => refreshMicrosoftTokenMock(...args),
}));

const dbUpdateMock = jest.fn();
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
  schema: {
    channelAccounts: { id: 'id' },
  },
}));

// Global fetch mock
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import { outlookAdapter } from '@/lib/channels/outlook';
import type { ChannelAccount } from '@/lib/db/schema';
import type { OutboundMessage } from '@/lib/channels/types';

// ── helpers ──────────────────────────────────────────────────────────────────

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
    id: 'acct-outlook-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    provider: 'outlook',
    externalAccountId: 'james@example.com',
    displayName: 'James Strickland',
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

const outbound: OutboundMessage = {
  to: 'recipient@example.com',
  subject: 'Hello Outlook',
  bodyText: 'World',
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe('outlookAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
  });

  // ── connect ──────────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('returns an error directing to Microsoft sign-in', async () => {
      const result = await outlookAdapter.connect({ workspaceId: 'ws-1', userId: 'u-1' });
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toMatch(/Microsoft sign-in/i);
    });

    it('does not return a channelAccountId', async () => {
      const result = await outlookAdapter.connect({ workspaceId: 'ws-1', userId: 'u-1' });
      expect(result).not.toHaveProperty('channelAccountId');
    });
  });

  // ── normalizeInbound ─────────────────────────────────────────────────────

  describe('normalizeInbound()', () => {
    it('returns null — Outlook is polling-based, not webhook-based', () => {
      expect(outlookAdapter.normalizeInbound({})).toBeNull();
      expect(outlookAdapter.normalizeInbound(null)).toBeNull();
    });
  });

  // ── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('POSTs to Graph /me/sendMail with correct auth header', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
      const account = makeAccount();

      await outlookAdapter.sendMessage(account, outbound);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/me/sendMail'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_access',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('includes subject and body in the request payload', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
      const account = makeAccount();

      await outlookAdapter.sendMessage(account, outbound);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.message.subject).toBe('Hello Outlook');
      expect(callBody.message.body.content).toBe('World');
      expect(callBody.message.body.contentType).toBe('Text');
    });

    it('sends HTML body when bodyHtml is provided', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
      const account = makeAccount();

      await outlookAdapter.sendMessage(account, {
        ...outbound,
        bodyHtml: '<p>World</p>',
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.message.body.contentType).toBe('HTML');
      expect(callBody.message.body.content).toBe('<p>World</p>');
    });

    it('sets toRecipients correctly', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
      const account = makeAccount();

      await outlookAdapter.sendMessage(account, outbound);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.message.toRecipients).toEqual([
        { emailAddress: { address: 'recipient@example.com' } },
      ]);
    });

    it('adds In-Reply-To header when inReplyTo is set', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
      const account = makeAccount();

      await outlookAdapter.sendMessage(account, {
        ...outbound,
        inReplyTo: '<original@example.com>',
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.message.internetMessageHeaders).toContainEqual({
        name: 'In-Reply-To',
        value: '<original@example.com>',
      });
    });

    it('maps attachments to Graph fileAttachment format', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => '' });
      const account = makeAccount();

      await outlookAdapter.sendMessage(account, {
        ...outbound,
        attachments: [{ filename: 'doc.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf') }],
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.message.attachments).toEqual([
        expect.objectContaining({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: 'doc.pdf',
          contentType: 'application/pdf',
        }),
      ]);
    });

    it('throws on Graph API error response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });
      const account = makeAccount();

      await expect(outlookAdapter.sendMessage(account, outbound)).rejects.toThrow(
        /Graph API error \(401\)/
      );
    });

    it('throws when credentialsEncrypted is null', async () => {
      const account = makeAccount({ credentialsEncrypted: null } as Partial<ChannelAccount>);

      await expect(outlookAdapter.sendMessage(account, outbound)).rejects.toThrow(
        /no credentials/
      );
    });

    it('refreshes token when near expiry before sending', async () => {
      const expiredCreds = makeCreds({ expiresAt: Date.now() - 1000 }); // already expired
      const account = makeAccount({
        credentialsEncrypted: Buffer.from(JSON.stringify(expiredCreds)),
      } as Partial<ChannelAccount>);

      refreshMicrosoftTokenMock.mockResolvedValue({
        accessToken: 'tok_refreshed',
        expiresAt: Date.now() + 3600 * 1000,
      });
      fetchMock.mockResolvedValue({ ok: true, status: 202, text: async () => '' });

      await outlookAdapter.sendMessage(account, outbound);

      expect(refreshMicrosoftTokenMock).toHaveBeenCalledWith('tok_refresh');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tok_refreshed' }),
        })
      );
    });
  });

  // ── sync() ───────────────────────────────────────────────────────────────

  describe('sync()', () => {
    it('calls processEmailSync with type=full when lastSyncAt is null', async () => {
      processEmailSyncMock.mockResolvedValue({ newEmailCount: 7, totalFetched: 7 });
      const account = makeAccount({ lastSyncAt: null } as Partial<ChannelAccount>);

      const result = await outlookAdapter.sync!(account);

      expect(processEmailSyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acct-outlook-1', type: 'full' })
      );
      expect(result.inserted).toBe(7);
    });

    it('calls processEmailSync with type=incremental when lastSyncAt is set', async () => {
      processEmailSyncMock.mockResolvedValue({ newEmailCount: 3, totalFetched: 10 });
      const account = makeAccount({
        lastSyncAt: new Date('2026-04-01T00:00:00Z'),
      } as Partial<ChannelAccount>);

      const result = await outlookAdapter.sync!(account);

      expect(processEmailSyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acct-outlook-1', type: 'incremental' })
      );
      expect(result.inserted).toBe(3);
    });

    it('passes userId from account', async () => {
      processEmailSyncMock.mockResolvedValue({ newEmailCount: 0, totalFetched: 0 });
      const account = makeAccount({ userId: 'usr-99' } as Partial<ChannelAccount>);

      await outlookAdapter.sync!(account);

      expect(processEmailSyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-99' })
      );
    });

    it('propagates errors from processEmailSync', async () => {
      processEmailSyncMock.mockRejectedValue(new Error('Graph 503'));
      const account = makeAccount();

      await expect(outlookAdapter.sync!(account)).rejects.toThrow('Graph 503');
    });
  });
});
