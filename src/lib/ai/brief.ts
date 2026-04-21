import { db, schema } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import { canProcessWithAI } from './limits';
import { AIClient, type AIClientConfig, type BriefResult } from './client';
import { buildBriefPrompt, type BriefEmailData } from './prompts';
import { decrypt } from '../crypto/encryption';

export type { BriefResult };

export async function generateBriefForUser(userId: string, timezone?: string): Promise<BriefResult> {
  // Check AI quota
  const limitStatus = await canProcessWithAI(userId);
  if (!limitStatus.allowed) {
    throw new Error(limitStatus.reason || 'AI processing not available');
  }

  // Get user info
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { name: true, userAnthropicKey: true, userOpenaiKey: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Determine API key
  let aiConfig: AIClientConfig | undefined;
  if (!limitStatus.useFounderKey) {
    if (user.userAnthropicKey) {
      aiConfig = { provider: 'anthropic', apiKey: decrypt(user.userAnthropicKey) };
    } else if (user.userOpenaiKey) {
      aiConfig = { provider: 'openai', apiKey: decrypt(user.userOpenaiKey) };
    }
  }

  // Get connected accounts
  const accounts = await db.query.emailAccounts.findMany({
    where: eq(schema.emailAccounts.userId, userId),
    columns: { id: true, email: true, displayName: true },
  });

  const accountEmails = accounts.map((a) => a.email);
  const accountMap = new Map(accounts.map((a) => [a.id, a.email]));

  // Get recent unread emails
  const recentEmails = await db.query.emails.findMany({
    where: and(
      eq(schema.emails.userId, userId),
      eq(schema.emails.isRead, false),
      eq(schema.emails.isDeleted, false),
      eq(schema.emails.isArchived, false),
    ),
    orderBy: [desc(schema.emails.receivedAt)],
    limit: 50,
    columns: {
      subject: true,
      fromAddress: true,
      fromName: true,
      snippet: true,
      aiCategory: true,
      aiPriority: true,
      receivedAt: true,
      accountId: true,
    },
  });

  // Build email data for prompt
  const emailData: BriefEmailData[] = recentEmails.map((e) => ({
    subject: e.subject || '(No Subject)',
    from: e.fromName || e.fromAddress,
    snippet: e.snippet || '',
    category: e.aiCategory || 'primary',
    priority: e.aiPriority || 'normal',
    receivedAt: e.receivedAt?.toISOString() || 'unknown',
    account: accountMap.get(e.accountId) || 'unknown',
  }));

  // Build prompt and generate brief
  const prompt = buildBriefPrompt(user.name || '', accountEmails, emailData, timezone);
  const aiClient = new AIClient(aiConfig);

  return aiClient.generateBrief(prompt);
}
