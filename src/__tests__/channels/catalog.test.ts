import { CHANNEL_CATALOG, CHANNEL_CATEGORIES } from '@/lib/channels/catalog';

describe('channel catalog', () => {
  it('contains exactly 12 channels', () => {
    expect(CHANNEL_CATALOG).toHaveLength(12);
  });

  it('has no duplicate channel ids', () => {
    const ids = CHANNEL_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every channel has a known category', () => {
    const validCategories = new Set(CHANNEL_CATEGORIES.map((c) => c.id));
    for (const def of CHANNEL_CATALOG) {
      expect(validCategories.has(def.category)).toBe(true);
    }
  });

  it('every oauth strategy has an initiatePath under /api/auth/oauth/', () => {
    const oauths = CHANNEL_CATALOG.filter((c) => c.strategy.kind === 'oauth');
    expect(oauths.length).toBeGreaterThan(0);
    for (const def of oauths) {
      if (def.strategy.kind !== 'oauth') throw new Error('narrow');
      expect(def.strategy.initiatePath).toMatch(/^\/api\/auth\/oauth\//);
    }
  });

  it('every install-doc strategy has a webhookPath under /api/webhooks/', () => {
    const installs = CHANNEL_CATALOG.filter((c) => c.strategy.kind === 'install-doc');
    expect(installs.length).toBeGreaterThan(0);
    for (const def of installs) {
      if (def.strategy.kind !== 'install-doc') throw new Error('narrow');
      expect(def.strategy.webhookPath).toMatch(/^\/api\/webhooks\//);
      expect(def.strategy.docUrl).toMatch(/^https:\/\//);
    }
  });

  it('every coming-soon strategy has a reason', () => {
    const cs = CHANNEL_CATALOG.filter((c) => c.strategy.kind === 'coming-soon');
    for (const def of cs) {
      if (def.strategy.kind !== 'coming-soon') throw new Error('narrow');
      expect(def.strategy.reason).toBeTruthy();
    }
  });

  it('gmail, outlook and imap are in the email category', () => {
    const emailIds = CHANNEL_CATALOG.filter((c) => c.category === 'email').map((c) => c.id);
    expect(emailIds).toEqual(expect.arrayContaining(['gmail', 'outlook', 'imap']));
  });
});
