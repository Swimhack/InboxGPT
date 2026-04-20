/**
 * @jest-environment node
 */

const mockResolve = jest.fn();
jest.mock('@/lib/email/autoconfig', () => ({
  resolveAutoconfig: (...args: unknown[]) => mockResolve(...args),
}));

describe('discoverEmailConfig', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    mockResolve.mockReset();
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  async function load() {
    return (await import('@/lib/email/autodiscover')).discoverEmailConfig;
  }

  it('returns null when resolveAutoconfig finds nothing', async () => {
    mockResolve.mockResolvedValue(null);
    const discoverEmailConfig = await load();
    expect(await discoverEmailConfig('a@nowhere.test')).toBeNull();
  });

  it('marks M365 oauthRequired=true and oauthUnavailable=true when Azure env missing', async () => {
    delete process.env.AZURE_AD_CLIENT_ID;
    delete process.env.AZURE_AD_CLIENT_SECRET;
    mockResolve.mockResolvedValue({
      imap: { host: 'outlook.office365.com', port: 993, secure: true },
      smtp: { host: 'smtp.office365.com', port: 587, secure: false },
      source: 'mx-m365',
      providerName: 'Microsoft 365',
    });
    const discoverEmailConfig = await load();
    const result = await discoverEmailConfig('a@company.example');
    expect(result?.oauthRequired).toBe(true);
    expect(result?.oauthUnavailable).toBe(true);
    expect(result?.oauthUnavailableReason).toContain('AZURE_AD_CLIENT_ID');
    expect(result?.oauthInitiatePath).toBeUndefined();
  });

  it('marks M365 oauthUnavailable=false when Azure env IS set', async () => {
    process.env.AZURE_AD_CLIENT_ID = 'id';
    process.env.AZURE_AD_CLIENT_SECRET = 'sec';
    mockResolve.mockResolvedValue({
      imap: { host: 'outlook.office365.com', port: 993, secure: true },
      smtp: { host: 'smtp.office365.com', port: 587, secure: false },
      source: 'mx-m365',
    });
    const discoverEmailConfig = await load();
    const result = await discoverEmailConfig('a@company.example');
    expect(result?.oauthRequired).toBe(true);
    expect(result?.oauthUnavailable).toBe(false);
    expect(result?.oauthInitiatePath).toContain('/api/auth/oauth/outlook');
  });

  it('marks Google oauthUnavailable=true when GOOGLE_CLIENT_ID missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    mockResolve.mockResolvedValue({
      imap: { host: 'imap.gmail.com', port: 993, secure: true },
      smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
      source: 'mx-google',
    });
    const discoverEmailConfig = await load();
    const result = await discoverEmailConfig('a@workspace.example');
    expect(result?.oauthUnavailable).toBe(true);
    expect(result?.oauthUnavailableReason).toContain('GOOGLE_CLIENT_ID');
  });

  it('marks non-OAuth providers oauthUnavailable=false regardless of env', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.AZURE_AD_CLIENT_ID;
    mockResolve.mockResolvedValue({
      imap: { host: 'mail.custom.example', port: 993, secure: true },
      smtp: { host: 'mail.custom.example', port: 587, secure: false },
      source: 'heuristic',
    });
    const discoverEmailConfig = await load();
    const result = await discoverEmailConfig('a@custom.example');
    expect(result?.oauthRequired).toBe(false);
    expect(result?.oauthUnavailable).toBe(false);
    expect(result?.oauthUnavailableReason).toBeUndefined();
  });
});
