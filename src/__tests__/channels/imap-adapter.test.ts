/**
 * Unit tests for the IMAP channel adapter (Tier-1 cutover).
 *
 * Covers: connect stub, sendMessage (SMTP), normalizeInbound, and sync() hook.
 * All I/O (nodemailer, processEmailSync) is mocked so no real network calls occur.
 */

const sendMailMock = jest.fn();
const closeMock = jest.fn();
const createTransportMock = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: (...args: unknown[]) => {
      createTransportMock(...args);
      return { sendMail: sendMailMock, close: closeMock };
    },
  },
}));

const processEmailSyncMock = jest.fn();
jest.mock('@/lib/queue/processors', () => ({
  processEmailSync: (...args: unknown[]) => processEmailSyncMock(...args),
}));

jest.mock('@/lib/crypto/encryption', () => ({
  decryptJSON: (buf: unknown) => JSON.parse((buf as Buffer).toString()),
  encryptJSON: (v: unknown) => Buffer.from(JSON.stringify(v)),
}));

import { imapAdapter } from '@/lib/channels/imap';
import type { ChannelAccount } from '@/lib/db/schema';
import type { OutboundMessage } from '@/lib/channels/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<ChannelAccount> = {}): ChannelAccount {
  const creds = {
    username: 'user@example.com',
    password: 'secret',
    imapHost: 'imap.example.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
  };
  return {
    id: 'acct-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    provider: 'imap',
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

// ── tests ─────────────────────────────────────────────────────────────────────

describe('imapAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── connect ──────────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('returns an error directing to the dedicated onboarding route', async () => {
      const result = await imapAdapter.connect({ workspaceId: 'ws-1', userId: 'u-1' });
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toMatch(/\/api\/channels\/imap\/connect/i);
    });
  });

  // ── normalizeInbound ─────────────────────────────────────────────────────

  describe('normalizeInbound()', () => {
    it('returns null — IMAP is polling-based, not webhook-based', () => {
      expect(imapAdapter.normalizeInbound({})).toBeNull();
      expect(imapAdapter.normalizeInbound(null)).toBeNull();
    });
  });

  // ── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    const outbound: OutboundMessage = {
      to: 'recipient@example.com',
      subject: 'Hello',
      bodyText: 'World',
    };

    it('creates transporter with correct SMTP credentials and sends mail', async () => {
      sendMailMock.mockResolvedValue({ messageId: '<msg-id@smtp.example.com>' });
      const account = makeAccount();

      const result = await imapAdapter.sendMessage(account, outbound);

      expect(createTransportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: { user: 'user@example.com', pass: 'secret' },
        })
      );

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringContaining('user@example.com'),
          to: 'recipient@example.com',
          subject: 'Hello',
          text: 'World',
        })
      );

      expect(result.providerMessageId).toBe('<msg-id@smtp.example.com>');
      expect(closeMock).toHaveBeenCalled();
    });

    it('uses displayName in the From header', async () => {
      sendMailMock.mockResolvedValue({ messageId: '<id>' });
      const account = makeAccount({ displayName: 'Alice Smith' } as Partial<ChannelAccount>);

      await imapAdapter.sendMessage(account, outbound);

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'Alice Smith <user@example.com>' })
      );
    });

    it('falls back to externalAccountId when displayName is null', async () => {
      sendMailMock.mockResolvedValue({ messageId: '<id>' });
      const account = makeAccount({ displayName: null } as Partial<ChannelAccount>);

      await imapAdapter.sendMessage(account, outbound);

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'user@example.com <user@example.com>' })
      );
    });

    it('passes inReplyTo when set', async () => {
      sendMailMock.mockResolvedValue({ messageId: '<id>' });
      const account = makeAccount();

      await imapAdapter.sendMessage(account, {
        ...outbound,
        inReplyTo: '<original-msg-id@example.com>',
      });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ inReplyTo: '<original-msg-id@example.com>' })
      );
    });

    it('throws if credentialsEncrypted is null', async () => {
      const account = makeAccount({ credentialsEncrypted: null } as Partial<ChannelAccount>);
      await expect(imapAdapter.sendMessage(account, outbound)).rejects.toThrow(/no credentials/);
    });

    it('throws if smtpHost is missing from credentials', async () => {
      const creds = {
        username: 'u@x.com',
        password: 'p',
        imapHost: 'imap.x.com',
        imapPort: 993,
        // smtpHost intentionally omitted
      };
      const account = makeAccount({
        credentialsEncrypted: Buffer.from(JSON.stringify(creds)),
      } as Partial<ChannelAccount>);

      await expect(imapAdapter.sendMessage(account, outbound)).rejects.toThrow(/no SMTP host/);
    });

    it('maps attachments correctly', async () => {
      sendMailMock.mockResolvedValue({ messageId: '<id>' });
      const account = makeAccount();

      await imapAdapter.sendMessage(account, {
        ...outbound,
        attachments: [{ filename: 'doc.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf') }],
      });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: 'doc.pdf',
              contentType: 'application/pdf',
            }),
          ],
        })
      );
    });
  });

  // ── sync() ───────────────────────────────────────────────────────────────

  describe('sync()', () => {
    it('calls processEmailSync with type=full when lastSyncAt is null', async () => {
      processEmailSyncMock.mockResolvedValue({ newEmailCount: 5, totalFetched: 5 });
      const account = makeAccount({ lastSyncAt: null } as Partial<ChannelAccount>);

      const result = await imapAdapter.sync!(account);

      expect(processEmailSyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acct-1', type: 'full' })
      );
      expect(result.inserted).toBe(5);
    });

    it('calls processEmailSync with type=incremental when lastSyncAt is set', async () => {
      processEmailSyncMock.mockResolvedValue({ newEmailCount: 2, totalFetched: 10 });
      const account = makeAccount({
        lastSyncAt: new Date('2026-04-01T00:00:00Z'),
      } as Partial<ChannelAccount>);

      const result = await imapAdapter.sync!(account);

      expect(processEmailSyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acct-1', type: 'incremental' })
      );
      expect(result.inserted).toBe(2);
    });

    it('propagates errors from processEmailSync', async () => {
      processEmailSyncMock.mockRejectedValue(new Error('IMAP connect failed'));
      const account = makeAccount();

      await expect(imapAdapter.sync!(account)).rejects.toThrow('IMAP connect failed');
    });

    it('passes userId from account', async () => {
      processEmailSyncMock.mockResolvedValue({ newEmailCount: 0, totalFetched: 0 });
      const account = makeAccount({ userId: 'usr-42' } as Partial<ChannelAccount>);

      await imapAdapter.sync!(account);

      expect(processEmailSyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'usr-42' })
      );
    });
  });
});
