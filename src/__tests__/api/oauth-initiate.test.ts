/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

describe('GET /api/auth/oauth/gmail (NextAuth delegation)', () => {
  it('redirects to NextAuth /api/auth/signin/google with callbackUrl', async () => {
    const { GET } = await import('@/app/api/auth/oauth/gmail/route');
    const req = new NextRequest(
      new URL('https://app.com/api/auth/oauth/gmail?from=/connect-channels')
    );
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location');
    expect(location).toContain('/api/auth/signin/google');
    expect(location).toContain('callbackUrl=');
    expect(location).toMatch(/callbackUrl=%2Fconnect-channels/);
  });

  it('defaults to /connect-channels when from is missing', async () => {
    const { GET } = await import('@/app/api/auth/oauth/gmail/route');
    const req = new NextRequest(new URL('https://app.com/api/auth/oauth/gmail'));
    const res = await GET(req);
    expect(res.headers.get('location')).toContain('callbackUrl=%2Fconnect-channels');
  });

  it('forwards prompt=select_account so users can pick a different Google account', async () => {
    const { GET } = await import('@/app/api/auth/oauth/gmail/route');
    const req = new NextRequest(new URL('https://app.com/api/auth/oauth/gmail'));
    const res = await GET(req);
    expect(res.headers.get('location')).toContain('prompt=select_account');
  });
});

describe('GET /api/auth/oauth/outlook', () => {
  const envBackup = { ...process.env };
  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns 501 when Azure env vars are missing', async () => {
    delete process.env.AZURE_AD_CLIENT_ID;
    delete process.env.AZURE_AD_CLIENT_SECRET;
    jest.resetModules();
    const { GET } = await import('@/app/api/auth/oauth/outlook/route');
    const req = new NextRequest(new URL('https://app.com/api/auth/oauth/outlook'));
    const res = await GET(req);
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toContain('AZURE_AD_CLIENT_ID');
  });

  it('redirects to NextAuth /api/auth/signin/azure-ad when env is configured', async () => {
    process.env.AZURE_AD_CLIENT_ID = 'id';
    process.env.AZURE_AD_CLIENT_SECRET = 'sec';
    jest.resetModules();
    const { GET } = await import('@/app/api/auth/oauth/outlook/route');
    const req = new NextRequest(
      new URL('https://app.com/api/auth/oauth/outlook?from=/connect-channels')
    );
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('/api/auth/signin/azure-ad');
  });
});
