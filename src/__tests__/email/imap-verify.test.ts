/**
 * @jest-environment node
 */

const mockConnect = jest.fn();
const mockNoop = jest.fn().mockResolvedValue(undefined);
const mockLogout = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
jest.mock('imapflow', () => ({
  ImapFlow: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    noop: mockNoop,
    logout: mockLogout,
    close: mockClose,
  })),
}));

import { verifyImap } from '@/lib/email/imap-verify';

describe('verifyImap', () => {
  beforeEach(() => {
    mockConnect.mockReset();
    mockNoop.mockClear();
    mockLogout.mockClear();
    mockClose.mockClear();
  });

  it('returns ok:true when connect + noop succeed', async () => {
    mockConnect.mockResolvedValue(undefined);
    const r = await verifyImap({
      host: 'imap.x.com',
      port: 993,
      secure: true,
      user: 'a@x.com',
      pass: 'p',
    });
    expect(r.ok).toBe(true);
  });

  it('maps AUTHENTICATIONFAILED code to auth_failed', async () => {
    mockConnect.mockRejectedValue(
      Object.assign(new Error('Invalid credentials'), { code: 'AUTHENTICATIONFAILED' })
    );
    const r = await verifyImap({ host: 'x', port: 993, secure: true, user: 'u', pass: 'p' });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('auth_failed');
  });

  it('maps message containing "authentication" to auth_failed', async () => {
    mockConnect.mockRejectedValue(new Error('Authentication failed'));
    const r = await verifyImap({ host: 'x', port: 993, secure: true, user: 'u', pass: 'p' });
    expect(r.errorCode).toBe('auth_failed');
  });

  it('maps ENOTFOUND to host_unreachable', async () => {
    mockConnect.mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND bad.host'), { code: 'ENOTFOUND' })
    );
    const r = await verifyImap({ host: 'bad.host', port: 993, secure: true, user: 'u', pass: 'p' });
    expect(r.errorCode).toBe('host_unreachable');
  });

  it('maps ETIMEDOUT to timeout', async () => {
    mockConnect.mockRejectedValue(new Error('ETIMEDOUT: connect timeout'));
    const r = await verifyImap({ host: 'x', port: 993, secure: true, user: 'u', pass: 'p' });
    expect(r.errorCode).toBe('timeout');
  });

  it('maps TLS errors to tls_error', async () => {
    mockConnect.mockRejectedValue(new Error('certificate verify failed: self-signed SSL'));
    const r = await verifyImap({ host: 'x', port: 993, secure: true, user: 'u', pass: 'p' });
    expect(r.errorCode).toBe('tls_error');
  });

  it('falls back to unknown for unrecognised errors with a safe user-facing message', async () => {
    mockConnect.mockRejectedValue(new Error('mystery failure'));
    const r = await verifyImap({ host: 'x', port: 993, secure: true, user: 'u', pass: 'p' });
    expect(r.errorCode).toBe('unknown');
    expect(r.errorMessage).toMatch(/could not sign in/i);
    expect(r.errorMessage).not.toContain('mystery');
  });
});
