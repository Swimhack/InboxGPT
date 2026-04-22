import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB. The Track-A rewrite of brief.ts uses:
//   - db.query.users.findFirst           (user info)
//   - db.query.workspaceMembers.findFirst (resolve workspace)
//   - db.select(...).from(channelAccounts) (connected accounts)
//   - db.select(...).from(messages)        (recent unread inbound)
const makeSelectBuilder = (rows: any) => ({
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(() => Promise.resolve(rows)),
  // The accounts query resolves after .where() — support both shapes.
  then: (res: any, rej: any) => Promise.resolve(rows).then(res, rej),
});

const mockSelect = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      workspaceMembers: { findFirst: vi.fn() },
    },
    select: (..._args: unknown[]) => mockSelect(..._args),
  },
  schema: {
    users: { id: 'id' },
    workspaceMembers: { userId: 'user_id', createdAt: 'created_at' },
    channelAccounts: {
      id: 'id',
      displayName: 'display_name',
      externalAccountId: 'external_account_id',
      workspaceId: 'workspace_id',
    },
    messages: {
      subject: 'subject',
      snippet: 'snippet',
      fromIdentity: 'from_identity',
      aiCategory: 'ai_category',
      aiPriority: 'ai_priority',
      receivedAt: 'received_at',
      channelAccountId: 'channel_account_id',
      workspaceId: 'workspace_id',
      direction: 'direction',
      isRead: 'is_read',
      isDeleted: 'is_deleted',
    },
  },
}));

vi.mock('@/lib/ai/limits', () => ({
  canProcessWithAI: vi.fn(),
}));

vi.mock('@/lib/ai/client', () => {
  const mockGenerateBrief = vi.fn();
  return {
    AIClient: vi.fn().mockImplementation(() => ({
      generateBrief: mockGenerateBrief,
    })),
    __mockGenerateBrief: mockGenerateBrief,
  };
});

vi.mock('@/lib/crypto/encryption', () => ({
  decrypt: vi.fn((buf: Buffer) => buf.toString()),
}));

import { generateBriefForUser } from '@/lib/ai/brief';
import { db } from '@/lib/db';
import { canProcessWithAI } from '@/lib/ai/limits';

const aiClientModule = await import('@/lib/ai/client');
const mockGenerateBrief = (aiClientModule as any).__mockGenerateBrief;

describe('generateBriefForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
  });

  it('throws when AI processing is not allowed', async () => {
    vi.mocked(canProcessWithAI).mockResolvedValue({
      allowed: false,
      reason: 'Free AI limit reached',
      useFounderKey: false,
    });

    await expect(generateBriefForUser('user-1')).rejects.toThrow('Free AI limit reached');
  });

  it('throws when user is not found', async () => {
    vi.mocked(canProcessWithAI).mockResolvedValue({ allowed: true, useFounderKey: true });
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

    await expect(generateBriefForUser('user-1')).rejects.toThrow('User not found');
  });

  it('returns an empty brief when user has no workspace', async () => {
    vi.mocked(canProcessWithAI).mockResolvedValue({ allowed: true, useFounderKey: true });
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      name: 'James',
      userAnthropicKey: null,
      userOpenaiKey: null,
    } as any);
    vi.mocked(db.query.workspaceMembers.findFirst).mockResolvedValue(undefined);

    const result = await generateBriefForUser('user-1');
    expect(result.greeting).toMatch(/James/);
    expect(result.sections).toEqual([]);
    expect(result.actionItems).toEqual([]);
    expect(mockGenerateBrief).not.toHaveBeenCalled();
  });

  it('generates a brief with founder key for inbound unread messages', async () => {
    vi.mocked(canProcessWithAI).mockResolvedValue({ allowed: true, useFounderKey: true });
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      name: 'James',
      userAnthropicKey: null,
      userOpenaiKey: null,
    } as any);
    vi.mocked(db.query.workspaceMembers.findFirst).mockResolvedValue({ workspaceId: 'ws-1' } as any);

    const accountRows = [
      { id: 'acc-1', displayName: 'James', externalAccountId: 'james@example.com' },
    ];
    const messageRows = [
      {
        subject: 'Test email',
        snippet: 'Hello James',
        fromIdentity: { kind: 'email', value: 'alice@example.com', display: 'Alice' },
        aiCategory: 'primary',
        aiPriority: 'normal',
        receivedAt: new Date('2026-04-17T10:00:00Z'),
        channelAccountId: 'acc-1',
      },
    ];

    mockSelect
      .mockReturnValueOnce(makeSelectBuilder(accountRows))
      .mockReturnValueOnce(makeSelectBuilder(messageRows));

    const expectedBrief = {
      greeting: 'Good morning, James!',
      summary: '1 unread email',
      sections: [
        {
          title: 'Updates',
          items: [
            { subject: 'Test email', from: 'Alice', summary: 'Hello', priority: 'normal' },
          ],
        },
      ],
      actionItems: [],
    };

    mockGenerateBrief.mockResolvedValue(expectedBrief);

    const result = await generateBriefForUser('user-1');
    expect(result).toEqual(expectedBrief);
    expect(mockGenerateBrief).toHaveBeenCalledOnce();
  });

  it('returns the empty-inbox brief when there are no unread messages', async () => {
    vi.mocked(canProcessWithAI).mockResolvedValue({ allowed: true, useFounderKey: true });
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      name: 'James',
      userAnthropicKey: null,
      userOpenaiKey: null,
    } as any);
    vi.mocked(db.query.workspaceMembers.findFirst).mockResolvedValue({ workspaceId: 'ws-1' } as any);

    mockSelect
      .mockReturnValueOnce(makeSelectBuilder([]))
      .mockReturnValueOnce(makeSelectBuilder([]));

    const result = await generateBriefForUser('user-1');
    expect(result.sections).toEqual([]);
    expect(result.summary).toMatch(/No unread/i);
    expect(mockGenerateBrief).not.toHaveBeenCalled();
  });
});
