import { describe, it, expect } from 'vitest';
import { buildBriefPrompt, buildSummarizePrompt, buildReplyPrompt, type BriefEmailData } from '@/lib/ai/prompts';

describe('buildBriefPrompt', () => {
  const sampleEmails: BriefEmailData[] = [
    {
      subject: 'Quarterly review due Friday',
      from: 'Alice Johnson',
      snippet: 'Please submit your quarterly review by end of day Friday.',
      category: 'primary',
      priority: 'urgent',
      receivedAt: '2026-04-17T10:00:00Z',
      account: 'james@example.com',
    },
    {
      subject: 'Team standup notes',
      from: 'Bob Smith',
      snippet: 'Here are the notes from today\'s standup meeting.',
      category: 'updates',
      priority: 'normal',
      receivedAt: '2026-04-17T09:00:00Z',
      account: 'james@work.com',
    },
  ];

  it('includes user name in prompt', () => {
    const prompt = buildBriefPrompt('James', ['james@example.com'], sampleEmails);
    expect(prompt).toContain('James');
  });

  it('includes account emails', () => {
    const prompt = buildBriefPrompt('James', ['james@example.com', 'james@work.com'], sampleEmails);
    expect(prompt).toContain('james@example.com');
    expect(prompt).toContain('james@work.com');
  });

  it('includes email subjects and senders', () => {
    const prompt = buildBriefPrompt('James', ['james@example.com'], sampleEmails);
    expect(prompt).toContain('Quarterly review due Friday');
    expect(prompt).toContain('Alice Johnson');
    expect(prompt).toContain('Team standup notes');
    expect(prompt).toContain('Bob Smith');
  });

  it('includes priority labels', () => {
    const prompt = buildBriefPrompt('James', ['james@example.com'], sampleEmails);
    expect(prompt).toContain('[URGENT]');
    expect(prompt).toContain('[NORMAL]');
  });

  it('handles zero emails gracefully', () => {
    const prompt = buildBriefPrompt('James', ['james@example.com'], []);
    expect(prompt).toContain('no unread emails');
    expect(prompt).toContain('James');
  });

  it('includes email count', () => {
    const prompt = buildBriefPrompt('James', ['james@example.com'], sampleEmails);
    expect(prompt).toContain('2');
  });

  it('requests JSON format', () => {
    const prompt = buildBriefPrompt('James', ['james@example.com'], sampleEmails);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('greeting');
    expect(prompt).toContain('actionItems');
  });
});

describe('buildSummarizePrompt', () => {
  it('includes subject and body', () => {
    const prompt = buildSummarizePrompt('Test Subject', 'Test body content');
    expect(prompt).toContain('Test Subject');
    expect(prompt).toContain('Test body content');
  });

  it('truncates long body', () => {
    const longBody = 'x'.repeat(5000);
    const prompt = buildSummarizePrompt('Subject', longBody);
    expect(prompt.length).toBeLessThan(5500);
  });
});

describe('buildReplyPrompt', () => {
  it('includes sender name', () => {
    const prompt = buildReplyPrompt('Subject', 'Body', 'Alice');
    expect(prompt).toContain('Alice');
  });
});
