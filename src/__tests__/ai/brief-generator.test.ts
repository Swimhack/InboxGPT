// Mock DB to prevent connection attempt
jest.mock('@/lib/db', () => ({ db: {}, schema: {} }));
jest.mock('drizzle-orm', () => ({ eq: () => ({}), and: () => ({}), desc: () => ({}) }));

import { buildPrompt, parseBriefResponse, buildStatsBrief } from '@/lib/ai/brief-generator';

const mockEmails = [
  {
    id: 'msg-1',
    subject: 'Urgent: Contract Review',
    snippet: 'Please review the attached contract by end of day',
    fromIdentity: { kind: 'email', value: 'boss@company.com', display: 'Jane Boss' },
    aiPriority: 'urgent',
    receivedAt: new Date(),
    isRead: false,
  },
  {
    id: 'msg-2',
    subject: 'Team Standup Notes',
    snippet: 'Here are the notes from today standup meeting',
    fromIdentity: { kind: 'email', value: 'team@company.com', display: 'Team Lead' },
    aiPriority: 'normal',
    receivedAt: new Date(),
    isRead: true,
  },
];

const mockStats = {
  unreadCount: 5,
  totalToday: 12,
  topSenders: ['Jane Boss', 'Team Lead', 'Client'],
};

describe('buildPrompt', () => {
  it('includes user name and all email subjects', () => {
    const prompt = buildPrompt('James', mockEmails);
    expect(prompt).toContain('James');
    expect(prompt).toContain('Urgent: Contract Review');
    expect(prompt).toContain('Team Standup Notes');
    expect(prompt).toContain('msg-1');
    expect(prompt).toContain('msg-2');
  });

  it('includes sender display names', () => {
    const prompt = buildPrompt('James', mockEmails);
    expect(prompt).toContain('Jane Boss');
    expect(prompt).toContain('Team Lead');
  });

  it('includes priority and read status', () => {
    const prompt = buildPrompt('James', mockEmails);
    expect(prompt).toContain('Priority: urgent');
    expect(prompt).toContain('Read: no');
    expect(prompt).toContain('Read: yes');
  });

  it('handles empty email list', () => {
    const prompt = buildPrompt('James', []);
    expect(prompt).toContain('0 most recent emails');
  });

  it('truncates snippets to 150 chars', () => {
    const longSnippet = 'a'.repeat(300);
    const emails = [{
      ...mockEmails[0],
      snippet: longSnippet,
    }];
    const prompt = buildPrompt('James', emails);
    expect(prompt).not.toContain('a'.repeat(300));
    expect(prompt).toContain('a'.repeat(150));
  });
});

describe('parseBriefResponse', () => {
  it('parses valid AI JSON response', () => {
    const validJson = JSON.stringify({
      greeting: 'Good morning, James',
      summary: 'You have 5 unread emails requiring attention.',
      actionItems: [
        { text: 'Review contract from Jane', messageId: 'msg-1', priority: 'urgent' },
      ],
      highlights: [
        { text: '3 emails from same sender', type: 'info' },
      ],
    });

    const result = parseBriefResponse(validJson, mockStats);
    expect(result.greeting).toBe('Good morning, James');
    expect(result.summary).toContain('5 unread');
    expect(result.actionItems).toHaveLength(1);
    expect(result.actionItems[0].priority).toBe('urgent');
    expect(result.highlights).toHaveLength(1);
    expect(result.stats).toEqual(mockStats);
    expect(result.generatedAt).toBeDefined();
  });

  it('strips markdown code fences from AI response', () => {
    const wrapped = '```json\n{"greeting":"Hi","summary":"test","actionItems":[],"highlights":[]}\n```';
    const result = parseBriefResponse(wrapped, mockStats);
    expect(result.greeting).toBe('Hi');
    expect(result.summary).toBe('test');
  });

  it('returns fallback on invalid JSON', () => {
    const result = parseBriefResponse('not valid json at all', mockStats);
    expect(result.greeting).toBeTruthy();
    expect(result.summary).toContain('inbox is ready');
    expect(result.actionItems).toEqual([]);
    expect(result.stats).toEqual(mockStats);
  });

  it('caps actionItems at 5 and highlights at 3', () => {
    const overflowJson = JSON.stringify({
      greeting: 'Hi',
      summary: 'test',
      actionItems: Array.from({ length: 10 }, (_, i) => ({
        text: `item ${i}`, messageId: `id-${i}`, priority: 'normal',
      })),
      highlights: Array.from({ length: 8 }, (_, i) => ({
        text: `highlight ${i}`, type: 'info',
      })),
    });
    const result = parseBriefResponse(overflowJson, mockStats);
    expect(result.actionItems).toHaveLength(5);
    expect(result.highlights).toHaveLength(3);
  });

  it('sanitizes invalid priority values to normal', () => {
    const json = JSON.stringify({
      greeting: 'Hi',
      summary: 'test',
      actionItems: [{ text: 'do thing', messageId: 'x', priority: 'CRITICAL' }],
      highlights: [],
    });
    const result = parseBriefResponse(json, mockStats);
    expect(result.actionItems[0].priority).toBe('normal');
  });
});

describe('buildStatsBrief', () => {
  it('builds a stats-only brief with unread count', () => {
    const result = buildStatsBrief('James', mockStats);
    expect(result.greeting).toContain('James');
    expect(result.summary).toContain('5 unread');
    expect(result.summary).toContain('12 arrived today');
    expect(result.actionItems).toEqual([]);
    expect(result.stats).toEqual(mockStats);
  });

  it('handles zero stats gracefully', () => {
    const result = buildStatsBrief('James', { unreadCount: 0, totalToday: 0, topSenders: [] });
    expect(result.summary).toContain('all caught up');
  });

  it('includes time-of-day greeting', () => {
    const result = buildStatsBrief('James', mockStats);
    expect(result.greeting).toMatch(/Good (morning|afternoon|evening), James/);
  });
});
