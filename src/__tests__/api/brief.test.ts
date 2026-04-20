/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn().mockResolvedValue({
    user: { id: 'user-uuid', name: 'James', email: 'james@test.com' },
  }),
}));
jest.mock('@/lib/auth/workspace', () => ({
  getWorkspace: jest.fn().mockResolvedValue({
    workspaceId: 'ws-uuid',
    userId: 'user-uuid',
  }),
}));

// Mock DB
const mockChannelAccounts: unknown[] = [{ id: 'ca-1' }];
const mockCachedBriefs: unknown[] = [];
const mockMessages: unknown[] = [];
const insertedBriefs: unknown[] = [];

jest.mock('@/lib/db', () => {
  const schema: Record<string, Record<string, string>> = {
    channelAccounts: { id: 'id', workspaceId: 'workspace_id', status: 'status' },
    briefs: { content: 'content', workspaceId: 'workspace_id', briefDate: 'brief_date' },
    messages: {
      id: 'id', subject: 'subject', snippet: 'snippet', fromIdentity: 'from_identity',
      aiPriority: 'ai_priority', receivedAt: 'received_at', isRead: 'is_read',
      workspaceId: 'workspace_id', isDeleted: 'is_deleted',
    },
  };
  // Create a thenable array-like object that also has .limit() and .orderBy()
  function makeChain(resolver: () => unknown[]) {
    const obj = {
      then: (resolve: (v: unknown) => void) => resolve(resolver()),
      limit: () => Promise.resolve(resolver()),
      orderBy: () => ({ limit: () => Promise.resolve(resolver()) }),
    };
    return obj;
  }

  let fromTable: unknown = null;
  const db = {
    select: () => ({
      from: (table: unknown) => {
        fromTable = table;
        return {
          where: () => {
            const t = fromTable;
            if (t === schema.channelAccounts) return makeChain(() => mockChannelAccounts);
            if (t === schema.briefs) return makeChain(() => mockCachedBriefs);
            if (t === schema.messages) return makeChain(() => mockMessages);
            return makeChain(() => []);
          },
        };
      },
    }),
    insert: () => ({
      values: (v: unknown) => {
        insertedBriefs.push(v);
        return { onConflictDoNothing: () => Promise.resolve() };
      },
    }),
  };
  return { db, schema };
});

jest.mock('drizzle-orm', () => ({
  eq: () => ({}),
  and: () => ({}),
  desc: () => ({}),
}));

describe('GET /api/brief', () => {
  beforeEach(() => {
    mockChannelAccounts.length = 0;
    mockChannelAccounts.push({ id: 'ca-1' });
    mockCachedBriefs.length = 0;
    mockMessages.length = 0;
    insertedBriefs.length = 0;
  });

  it('returns null when no channel accounts exist', async () => {
    mockChannelAccounts.length = 0;
    const { GET } = await import('@/app/api/brief/route');
    const res = await GET();
    const body = await res.json();
    expect(body.brief).toBeNull();
    expect(body.reason).toBe('no_accounts');
  });

  it('returns cached brief if one exists for today', async () => {
    const cachedContent = { greeting: 'Hi cached', summary: 'cached', actionItems: [], highlights: [], stats: { unreadCount: 0, totalToday: 0, topSenders: [] }, generatedAt: '' };
    mockCachedBriefs.push({ content: cachedContent });
    const { GET } = await import('@/app/api/brief/route');
    const res = await GET();
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.brief.greeting).toBe('Hi cached');
  });

  it('generates stats-only brief when no AI key configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    mockMessages.push({
      id: 'msg-1', subject: 'Test', snippet: 'test snippet',
      fromIdentity: { kind: 'email', value: 'a@b.com' },
      aiPriority: null, receivedAt: new Date(), isRead: false,
    });
    jest.resetModules();
    const { GET } = await import('@/app/api/brief/route');
    const res = await GET();
    const body = await res.json();
    expect(body.brief).toBeDefined();
    expect(body.brief.greeting).toMatch(/Good/);
    expect(body.brief.actionItems).toEqual([]);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { getSession } = await import('@/lib/auth/session');
    (getSession as jest.Mock).mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/brief/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
