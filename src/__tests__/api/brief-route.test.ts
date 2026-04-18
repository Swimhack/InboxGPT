import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/ai/brief', () => ({
  generateBriefForUser: vi.fn(),
}));

import { POST } from '@/app/api/brief/route';
import { getSession } from '@/lib/auth/session';
import { generateBriefForUser } from '@/lib/ai/brief';

describe('POST /api/brief', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 200 with brief data', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'james@example.com', name: 'James' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    const mockBrief = {
      greeting: 'Good morning!',
      summary: '3 unread emails',
      sections: [],
      actionItems: [],
    };

    vi.mocked(generateBriefForUser).mockResolvedValue(mockBrief);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief).toEqual(mockBrief);
  });

  it('returns 403 when AI limit reached', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'james@example.com', name: 'James' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.mocked(generateBriefForUser).mockRejectedValue(
      new Error('Free AI limit reached. Add your own API key to continue.')
    );

    const res = await POST();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('limit');
  });

  it('returns 500 on unexpected errors', async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'james@example.com', name: 'James' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.mocked(generateBriefForUser).mockRejectedValue(new Error('Database connection failed'));

    const res = await POST();
    expect(res.status).toBe(500);
  });
});
