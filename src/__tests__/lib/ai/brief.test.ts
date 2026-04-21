import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      emailAccounts: { findMany: vi.fn() },
      emails: { findMany: vi.fn() },
    },
  },
  schema: {
    users: { id: 'id' },
    emailAccounts: { userId: 'user_id' },
    emails: {
      userId: 'user_id',
      isRead: 'is_read',
      isDeleted: 'is_deleted',
      isArchived: 'is_archived',
      receivedAt: 'received_at',
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

// Get the mock function from the module
const aiClientModule = await import('@/lib/ai/client');
const mockGenerateBrief = (aiClientModule as any).__mockGenerateBrief;

describe('generateBriefForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(canProcessWithAI).mockResolvedValue({
      allowed: true,
      useFounderKey: true,
    });
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

    await expect(generateBriefForUser('user-1')).rejects.toThrow('User not found');
  });

  it('generates a brief with founder key', async () => {
    vi.mocked(canProcessWithAI).mockResolvedValue({
      allowed: true,
      useFounderKey: true,
    });

    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      name: 'James',
      userAnthropicKey: null,
      userOpenaiKey: null,
    } as any);

    vi.mocked(db.query.emailAccounts.findMany).mockResolvedValue([
      { id: 'acc-1', email: 'james@example.com', displayName: 'James' },
    ] as any);

    vi.mocked(db.query.emails.findMany).mockResolvedValue([
      {
        subject: 'Test email',
        fromAddress: 'alice@example.com',
        fromName: 'Alice',
        snippet: 'Hello James',
        aiCategory: 'primary',
        aiPriority: 'normal',
        receivedAt: new Date('2026-04-17T10:00:00Z'),
        accountId: 'acc-1',
      },
    ] as any);

    const expectedBrief = {
      greeting: 'Good morning, James!',
      summary: '1 unread email',
      sections: [{ title: 'Updates', items: [{ subject: 'Test email', from: 'Alice', summary: 'Hello', priority: 'normal' }] }],
      actionItems: [],
    };

    mockGenerateBrief.mockResolvedValue(expectedBrief);

    const result = await generateBriefForUser('user-1');
    expect(result).toEqual(expectedBrief);
    expect(mockGenerateBrief).toHaveBeenCalledOnce();
  });

  it('returns empty sections when no unread emails', async () => {
    vi.mocked(canProcessWithAI).mockResolvedValue({
      allowed: true,
      useFounderKey: true,
    });

    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      name: 'James',
      userAnthropicKey: null,
      userOpenaiKey: null,
    } as any);

    vi.mocked(db.query.emailAccounts.findMany).mockResolvedValue([
      { id: 'acc-1', email: 'james@example.com', displayName: 'James' },
    ] as any);

    vi.mocked(db.query.emails.findMany).mockResolvedValue([]);

    const expectedBrief = {
      greeting: 'Good morning, James!',
      summary: 'Inbox is clear',
      sections: [],
      actionItems: [],
    };

    mockGenerateBrief.mockResolvedValue(expectedBrief);

    const result = await generateBriefForUser('user-1');
    expect(result.sections).toEqual([]);
  });
});
