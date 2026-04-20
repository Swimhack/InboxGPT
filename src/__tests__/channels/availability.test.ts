import { getProviderAvailability } from '@/lib/channels/availability';

describe('getProviderAvailability', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('marks gmail ready when both GOOGLE_CLIENT_ID and _SECRET are set', () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const a = getProviderAvailability();
    expect(a.gmail.ready).toBe(true);
    expect(a.gmail.reason).toBeUndefined();
  });

  it('marks gmail NOT ready when GOOGLE_CLIENT_ID is empty', () => {
    process.env.GOOGLE_CLIENT_ID = '';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const a = getProviderAvailability();
    expect(a.gmail.ready).toBe(false);
    expect(a.gmail.reason).toContain('GOOGLE_CLIENT_ID');
  });

  it('marks outlook NOT ready when AZURE vars missing', () => {
    delete process.env.AZURE_AD_CLIENT_ID;
    delete process.env.AZURE_AD_CLIENT_SECRET;
    const a = getProviderAvailability();
    expect(a.outlook.ready).toBe(false);
    expect(a.outlook.reason).toContain('AZURE_AD_CLIENT_ID');
  });

  it('marks imap always ready (no external config)', () => {
    const a = getProviderAvailability();
    expect(a.imap.ready).toBe(true);
  });

  it('marks slack and discord ready (webhook install-doc)', () => {
    const a = getProviderAvailability();
    expect(a.slack.ready).toBe(true);
    expect(a.discord.ready).toBe(true);
  });

  it('keeps coming-soon providers permanently not ready', () => {
    const a = getProviderAvailability();
    expect(a.meta_ig.ready).toBe(false);
    expect(a.meta_fb.ready).toBe(false);
    expect(a.whatsapp.ready).toBe(false);
    expect(a.x.ready).toBe(false);
    expect(a.linkedin.ready).toBe(false);
    expect(a.twilio.ready).toBe(false);
    expect(a.signal.ready).toBe(false);
  });

  it('returns availability for every channel enum value (no orphans)', () => {
    const a = getProviderAvailability();
    const keys = Object.keys(a).sort();
    expect(keys).toEqual(
      [
        'gmail',
        'outlook',
        'imap',
        'twilio',
        'slack',
        'discord',
        'meta_ig',
        'meta_fb',
        'whatsapp',
        'x',
        'linkedin',
        'signal',
      ].sort()
    );
  });
});
