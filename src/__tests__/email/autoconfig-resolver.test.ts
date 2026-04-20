/**
 * @jest-environment node
 */

// Mock DNS before import
const mockResolveSrv = jest.fn();
const mockResolveMx = jest.fn();
const mockResolve4 = jest.fn();
jest.mock('dns', () => ({
  promises: {
    resolveSrv: (...args: unknown[]) => mockResolveSrv(...args),
    resolveMx: (...args: unknown[]) => mockResolveMx(...args),
    resolve4: (...args: unknown[]) => mockResolve4(...args),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { resolveAutoconfig } from '@/lib/email/autoconfig';

function reject(reason = 'ENOTFOUND') {
  return Promise.reject(Object.assign(new Error(reason), { code: reason }));
}

describe('resolveAutoconfig', () => {
  beforeEach(() => {
    mockResolveSrv.mockReset();
    mockResolveMx.mockReset();
    mockResolve4.mockReset();
    mockFetch.mockReset();
  });

  it('returns builtin config for gmail.com without any network calls', async () => {
    const result = await resolveAutoconfig('alice@gmail.com');
    expect(result?.source).toBe('builtin');
    expect(result?.imap.host).toBe('imap.gmail.com');
    expect(mockResolveSrv).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns ispdb config when Mozilla autoconfig returns valid XML', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        '<clientConfig><emailProvider><displayName>Custom</displayName>' +
        '<incomingServer type="imap"><hostname>imap.custom.co</hostname><port>993</port><socketType>SSL</socketType></incomingServer>' +
        '<outgoingServer type="smtp"><hostname>smtp.custom.co</hostname><port>587</port><socketType>STARTTLS</socketType></outgoingServer>' +
        '</emailProvider></clientConfig>',
    });
    const result = await resolveAutoconfig('user@custom.co');
    expect(result?.source).toBe('ispdb');
    expect(result?.imap.host).toBe('imap.custom.co');
    expect(result?.providerName).toBe('Custom');
  });

  it('falls back to DNS SRV when ISPDB has no entry', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockResolveSrv.mockImplementation((name: string) => {
      if (name === '_imaps._tcp.srv-example.com') {
        return Promise.resolve([{ priority: 10, weight: 1, port: 993, name: 'imap.srv-example.com.' }]);
      }
      if (name === '_submissions._tcp.srv-example.com') {
        return Promise.resolve([{ priority: 10, weight: 1, port: 465, name: 'smtp.srv-example.com.' }]);
      }
      return reject();
    });
    const result = await resolveAutoconfig('a@srv-example.com');
    expect(result?.source).toBe('srv');
    expect(result?.imap.host).toBe('imap.srv-example.com');
    expect(result?.smtp.port).toBe(465);
  });

  it('infers Google Workspace from MX record', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockResolveSrv.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveMx.mockResolvedValueOnce([
      { priority: 1, exchange: 'ASPMX.L.GOOGLE.COM' },
      { priority: 5, exchange: 'ALT1.ASPMX.L.GOOGLE.COM' },
    ]);
    const result = await resolveAutoconfig('bob@workspacecustomer.com');
    expect(result?.source).toBe('mx-google');
    expect(result?.imap.host).toBe('imap.gmail.com');
    expect(result?.providerName).toBe('Google Workspace');
  });

  it('infers M365 from MX record', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockResolveSrv.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveMx.mockResolvedValueOnce([
      { priority: 0, exchange: 'stricklandtechnology-net.mail.protection.outlook.com' },
    ]);
    const result = await resolveAutoconfig('james@stricklandtechnology.net');
    expect(result?.source).toBe('mx-m365');
    expect(result?.imap.host).toBe('outlook.office365.com');
  });

  it('falls back to heuristic A lookup for mail.<domain>', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockResolveSrv.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveMx.mockResolvedValueOnce([]);
    mockResolve4.mockImplementation((name: string) => {
      if (name === 'mail.obscure.example') return Promise.resolve(['1.2.3.4']);
      return reject();
    });
    const result = await resolveAutoconfig('u@obscure.example');
    expect(result?.source).toBe('heuristic');
    expect(result?.imap.host).toBe('mail.obscure.example');
  });

  it('returns null when no strategy finds anything', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockResolveSrv.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
    const result = await resolveAutoconfig('nothing@this-domain-does-not-exist.test');
    expect(result).toBeNull();
  });

  it('returns null when email has no @', async () => {
    const result = await resolveAutoconfig('not-an-email');
    expect(result).toBeNull();
  });
});
