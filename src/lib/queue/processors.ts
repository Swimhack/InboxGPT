/**
 * Job processors - handles email sync and AI processing
 *
 * These run in-process, no separate worker needed!
 */

import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { createImapClient } from '../email/imap-client';
import { getAIClient } from '../ai/client';
import { generateId } from '../utils';
import {
  type EmailSyncJobData,
  type AIProcessingJobData,
  addAIProcessingJob,
} from './simple-queue';

/**
 * Process an email sync job
 */
export async function processEmailSync(data: EmailSyncJobData): Promise<{
  newEmailCount: number;
  totalFetched: number;
  skipped?: boolean;
}> {
  const { accountId, userId, type } = data;

  console.log(`[EmailSync] Starting ${type} sync for account ${accountId}`);

  // Get account from database
  const account = await db.query.emailAccounts.findFirst({
    where: eq(schema.emailAccounts.id, accountId),
  });

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  if (!account.isActive) {
    console.log(`[EmailSync] Account ${accountId} is not active, skipping`);
    return { skipped: true, newEmailCount: 0, totalFetched: 0 };
  }

  // Update sync status
  await db
    .update(schema.emailAccounts)
    .set({ syncStatus: 'syncing', syncError: null })
    .where(eq(schema.emailAccounts.id, accountId));

  let client;
  try {
    // Connect to IMAP
    client = await createImapClient(account);

    // Determine fetch options
    const fetchOptions: Parameters<typeof client.fetchEmails>[0] = {
      folder: 'INBOX',
      limit: type === 'full' ? 500 : 50,
    };

    if (type === 'incremental' && account.lastSyncUid) {
      fetchOptions.sinceUid = account.lastSyncUid;
    } else if (type === 'incremental' && account.lastSyncAt) {
      fetchOptions.since = account.lastSyncAt;
    }

    // Fetch emails
    const messages = await client.fetchEmails(fetchOptions);
    console.log(`[EmailSync] Fetched ${messages.length} messages for account ${accountId}`);

    let highestUid = account.lastSyncUid || 0;
    let newEmailCount = 0;

    // Process each message
    for (const message of messages) {
      // Check if email already exists
      const existingEmail = await db.query.emails.findFirst({
        where: eq(schema.emails.messageId, message.messageId),
      });

      if (existingEmail) {
        // Update flags if changed
        if (
          existingEmail.isRead !== message.flags.seen ||
          existingEmail.isStarred !== message.flags.flagged
        ) {
          await db
            .update(schema.emails)
            .set({
              isRead: message.flags.seen,
              isStarred: message.flags.flagged,
              updatedAt: new Date(),
            })
            .where(eq(schema.emails.id, existingEmail.id));
        }
        continue;
      }

      // Insert new email
      const emailId = generateId();

      await db.insert(schema.emails).values({
        id: emailId,
        accountId,
        userId,
        messageId: message.messageId,
        threadId: message.threadId,
        uid: message.uid,
        subject: message.subject,
        fromAddress: message.from.address,
        fromName: message.from.name,
        toAddresses: JSON.stringify(message.to),
        ccAddresses: message.cc ? JSON.stringify(message.cc) : null,
        sentAt: message.date,
        receivedAt: message.date,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        snippet: message.bodyText?.slice(0, 200),
        hasAttachments: message.attachments.length > 0,
        isRead: message.flags.seen,
        isStarred: message.flags.flagged,
        isDraft: message.flags.draft,
        folder: 'inbox',
      });

      // Insert attachments
      for (const attachment of message.attachments) {
        await db.insert(schema.attachments).values({
          id: generateId(),
          emailId,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          contentId: attachment.contentId,
        });
      }

      // Queue AI processing for new emails
      await addAIProcessingJob({
        emailId,
        userId,
        tasks: ['summarize', 'categorize', 'suggest-replies'],
      });

      newEmailCount++;

      if (message.uid > highestUid) {
        highestUid = message.uid;
      }
    }

    // Update account sync status
    await db
      .update(schema.emailAccounts)
      .set({
        syncStatus: 'idle',
        lastSyncAt: new Date(),
        lastSyncUid: highestUid > 0 ? highestUid : account.lastSyncUid,
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailAccounts.id, accountId));

    console.log(`[EmailSync] Completed for account ${accountId}: ${newEmailCount} new emails`);

    return { newEmailCount, totalFetched: messages.length };
  } catch (error) {
    console.error(`[EmailSync] Failed for account ${accountId}:`, error);

    // Update error status
    await db
      .update(schema.emailAccounts)
      .set({
        syncStatus: 'error',
        syncError: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      })
      .where(eq(schema.emailAccounts.id, accountId));

    throw error;
  } finally {
    if (client) {
      await client.disconnect().catch(console.error);
    }
  }
}

/**
 * Process an AI job
 */
import { canProcessWithAI } from '../ai/limits';
import { AIClient, type AIClientConfig } from '../ai/client';
import { decrypt } from '../crypto/encryption';

// ... (other imports)

export async function processAIJob(data: AIProcessingJobData): Promise<{
  success: boolean;
  summary?: string;
  category?: string;
  priority?: string;
  hasReplies?: boolean;
  skipped?: boolean;
  reason?: string;
}> {
  const { emailId, userId, tasks } = data;

  console.log(`[AI] Processing tasks for email ${emailId}: ${tasks.join(', ')}`);

  // Check quota/limits first
  const limitStatus = await canProcessWithAI(userId);
  if (!limitStatus.allowed) {
    console.log(`[AI] Usage limit reached for user ${userId}: ${limitStatus.reason}`);
    await db.update(schema.emails)
      .set({
        aiProcessedAt: new Date(),
        aiSummary: limitStatus.reason || "AI Limit Reached"
      })
      .where(eq(schema.emails.id, emailId));
    return { success: true, skipped: true, reason: limitStatus.reason };
  }

  // Determine API Key (Founder vs User)
  let aiConfig: AIClientConfig | undefined;

  if (!limitStatus.useFounderKey) {
    // Fetch user keys
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { userAnthropicKey: true, userOpenaiKey: true }
    });

    if (user?.userAnthropicKey) {
      aiConfig = { provider: 'anthropic', apiKey: decrypt(user.userAnthropicKey) };
    } else if (user?.userOpenaiKey) {
      aiConfig = { provider: 'openai', apiKey: decrypt(user.userOpenaiKey) };
    }

    // If we are here, limitStatus.allowed is true, but useFounderKey is false.
    // This usually means the user has keys. If they don't (race condition?), we should fail or fallback?
    // actually limits.ts checks if keys exist. So we should find them. 
    // If decryption fails or something, we might error out, which is correct.
  }

  // Use configured client instead of singleton
  const aiClient = new AIClient(aiConfig);

  // Get email from database
  const email = await db.query.emails.findFirst({
    where: eq(schema.emails.id, emailId),
  });

  if (!email) {
    throw new Error(`Email ${emailId} not found`);
  }

  // Skip if already processed
  if (email.aiProcessedAt) {
    console.log(`[AI] Email ${emailId} already processed, skipping`);
    return { success: true, skipped: true };
  }

  const updates: Partial<typeof schema.emails.$inferInsert> = {};

  try {
    // Get email content
    const subject = email.subject || '(No Subject)';
    const body = email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '';

    if (!body) {
      console.log(`[AI] Email ${emailId} has no body content, skipping`);
      return { success: true, skipped: true, reason: 'no_content' };
    }

    // Process tasks
    if (tasks.includes('summarize') || tasks.includes('categorize')) {
      const result = await aiClient.summarize(subject, body);

      updates.aiSummary = result.summary;
      updates.aiCategory = result.category;
      updates.aiPriority = result.priority;

      console.log(`[AI] Summarized email ${emailId}: ${result.category}, ${result.priority}`);
    }

    if (tasks.includes('suggest-replies')) {
      const senderName = email.fromName || email.fromAddress;
      const result = await aiClient.generateReplies(subject, body, senderName);

      if (result.replies.length > 0) {
        updates.aiSuggestedReplies = JSON.stringify(result.replies);
        console.log(`[AI] Generated ${result.replies.length} reply suggestions for email ${emailId}`);
      }
    }

    // Update email with AI results
    updates.aiProcessedAt = new Date();
    updates.updatedAt = new Date();

    await db.update(schema.emails).set(updates).where(eq(schema.emails.id, emailId));

    // Track Usage
    await db.insert(schema.aiUsage).values({
      id: generateId(),
      userId,
      date: new Date().toISOString().slice(0, 10),
      emailsProcessed: 1,
      tokensUsed: 0,
      estimatedCostCents: 0
    });

    console.log(`[AI] Processing completed for email ${emailId}`);

    return {
      success: true,
      summary: updates.aiSummary ?? undefined,
      category: updates.aiCategory ?? undefined,
      priority: updates.aiPriority ?? undefined,
      hasReplies: !!updates.aiSuggestedReplies,
    };
  } catch (error) {
    console.error(`[AI] Processing failed for email ${emailId}:`, error);
    throw error;
  }
}
