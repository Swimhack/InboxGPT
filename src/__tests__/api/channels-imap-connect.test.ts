/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn().mockResolvedValue({ user: { id: 'user-uuid' } }),
}));
jest.mock('@/lib/auth/workspace', () => ({
  getWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-uuid', userId: 'user-uuid' }),
}));

const mockResolve = jest.fn();
jest.mock('@/lib/email/autoconfig', () => ({
  resolveAutoconfig: (...args: unknown[]) => mockResolve(...args),
}));

const mockVerify = jest.fn();
jest.mock('@/lib/email/imap-verify', () => ({
  verifyImap: (...args: unknown[]) => mockVerify(...args),
}));

jest.mock('@/lib/crypto/encryption', () => ({
  encryptJSON: (v: unknown) => Buffer.from(JSON.stringify(v)),
}));

const insertedRows: Record<string, unknown>[] = [];
const selectResults: { ret: unknown[] }[] = [];

jest.mock('@/lib/db', () => {
  const schema: Record<string, unknown> = {
    channelAccounts: {
      id: 'id',
      workspaceId: 'workspace_id',
      provider: 'provider',
      externalAccountId: 'external_account_id',
    },
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(selectResults.shift()?.ret ?? []),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => {
          const row = { id: 'new-account-id' };
          insertedRows.push(v);
          return Promise.resolve([row]);
        },
      }),
    }),
  };
  return { db, schema };
});

jest.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  and: (...args: unknown[]) => ({ and: args }),
}));

describe('POST /api/channels/imap/connect', () => {
  beforeEach(() => {
    mockResolve.mockReset();
    mockVerify.mockReset();
    insertedRows.length = 0;
    selectResults.length = 0;
  });

  async function call(body: unknown) {
    const { POST } = await import('@/app/api/channels/imap/connect/route');
    const req = new NextRequest(new URL('https://app.com/api/channels/imap/connect'), {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it('auto-discovers, verifies, and persists on happy path', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'imap.x.com', port: 993, secure: true },
      smtp: { host: 'smtp.x.com', port: 587, secure: false },
      source: 'builtin',
    });
    mockVerify.mockResolvedValue({ ok: true });
    selectResults.push({ ret: [] }); // duplicate check returns empty

    const res = await call({ email: 'a@x.com', password: 'secret' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0];
    expect(row.workspaceId).toBe('ws-uuid');
    expect(row.provider).toBe('imap');
    expect(row.externalAccountId).toBe('a@x.com');
    expect(row.status).toBe('active');
    expect(Buffer.isBuffer(row.credentialsEncrypted)).toBe(true);
    // No Phase 0 columns
    expect(row).not.toHaveProperty('encryptedAccessToken');
    expect(row).not.toHaveProperty('isActive');
    expect(row).not.toHaveProperty('providerType');
  });

  it('returns 422 with needsManual when discovery fails and no overrides', async () => {
    mockResolve.mockResolvedValue(null);
    const res = await call({ email: 'u@unknown.test', password: 'p' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.needsManual).toBe(true);
  });

  it('uses overrides when provided and skips discovery for those fields', async () => {
    mockResolve.mockResolvedValue(null);
    mockVerify.mockResolvedValue({ ok: true });
    selectResults.push({ ret: [] });

    const res = await call({
      email: 'u@unknown.test',
      password: 'p',
      overrides: {
        imapHost: 'manual.imap.com',
        imapPort: 993,
        smtpHost: 'manual.smtp.com',
        smtpPort: 587,
      },
    });
    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'manual.imap.com', port: 993 })
    );
    expect(insertedRows[0].externalAccountId).toBe('u@unknown.test');
  });

  it('returns 401 + auth_failed code when verify fails with auth error', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'imap.x.com', port: 993, secure: true },
      smtp: { host: 'smtp.x.com', port: 587, secure: false },
      source: 'builtin',
    });
    mockVerify.mockResolvedValue({ ok: false, errorCode: 'auth_failed', errorMessage: 'Invalid' });

    const res = await call({ email: 'a@x.com', password: 'wrong' });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('auth_failed');
    expect(body.error).toMatch(/Email or password/i);
  });

  it('returns 409 when account already exists', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'imap.x.com', port: 993, secure: true },
      smtp: { host: 'smtp.x.com', port: 587, secure: false },
      source: 'builtin',
    });
    mockVerify.mockResolvedValue({ ok: true });
    selectResults.push({ ret: [{ id: 'existing-id' }] });

    const res = await call({ email: 'a@x.com', password: 'p' });
    expect(res.status).toBe(409);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getSession } = await import('@/lib/auth/session');
    (getSession as jest.Mock).mockResolvedValueOnce(null);
    const res = await call({ email: 'a@x.com', password: 'p' });
    expect(res.status).toBe(401);
  });

  it('rejects M365 with oauth_required code and OAuth URL — never calls verifyImap', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'outlook.office365.com', port: 993, secure: true },
      smtp: { host: 'smtp.office365.com', port: 587, secure: false },
      source: 'mx-m365',
      providerName: 'Microsoft 365',
    });
    const res = await call({ email: 'james@ekaty.com', password: 'pw' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('oauth_required');
    expect(body.provider).toBe('outlook');
    expect(body.oauthUrl).toContain('/api/auth/oauth/outlook');
    expect(mockVerify).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it('rejects Google Workspace MX with oauth_required code', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'imap.gmail.com', port: 993, secure: true },
      smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
      source: 'mx-google',
      providerName: 'Google Workspace',
    });
    const res = await call({ email: 'user@gworkspace.example', password: 'pw' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('oauth_required');
    expect(body.provider).toBe('gmail');
  });

  it('rejects builtin Outlook (outlook.com domain) with oauth_required', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'outlook.office365.com', port: 993, secure: true },
      smtp: { host: 'smtp.office365.com', port: 587, secure: false },
      source: 'builtin',
      providerName: 'Outlook / Microsoft 365',
    });
    const res = await call({ email: 'a@outlook.com', password: 'pw' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('oauth_required');
  });

  it('rejects ISPDB / any source when IMAP host is outlook.office365.com (host-based M365 rule)', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'outlook.office365.com', port: 993, secure: true },
      smtp: { host: 'smtp.office365.com', port: 587, secure: false },
      source: 'ispdb',
      providerName: 'Microsoft 365',
    });
    const res = await call({ email: 'user@custom-domain.example', password: 'pw' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('oauth_required');
    expect(body.provider).toBe('outlook');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('rejects any source when IMAP host is imap.gmail.com (Google hosted rule)', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'imap.gmail.com', port: 993, secure: true },
      smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
      source: 'ispdb',
    });
    const res = await call({ email: 'user@custom-domain.example', password: 'pw' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('oauth_required');
    expect(body.provider).toBe('gmail');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('allows M365 when user provides a manual host override (advanced path)', async () => {
    mockResolve.mockResolvedValue({
      imap: { host: 'outlook.office365.com', port: 993, secure: true },
      smtp: { host: 'smtp.office365.com', port: 587, secure: false },
      source: 'mx-m365',
    });
    mockVerify.mockResolvedValue({ ok: true });
    selectResults.push({ ret: [] });
    const res = await call({
      email: 'admin@company.example',
      password: 'pw',
      overrides: {
        imapHost: 'imap.corp.company.example',
        imapPort: 993,
        smtpHost: 'smtp.corp.company.example',
        smtpPort: 587,
      },
    });
    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalled();
  });
});
