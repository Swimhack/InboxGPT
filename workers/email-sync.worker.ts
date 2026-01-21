import { Worker, Job } from 'bullmq';
import { db, schema } from '../src/lib/db';
import { eq } from 'drizzle-orm';
import { createImapClient } from '../src/lib/email/imap-client';
import { addAIProcessingJob, getRedisConnection, type EmailSyncJob } from '../src/lib/queue';
import { generateId } from '../src/lib/utils';

async function processEmailSync(job: Job<EmailSyncJob>) {
  const { accountId, userId, type } = job.data;

  console.log(`Starting ${type} sync for account ${accountId}`);

  // Get account from database
  const account = await db.query.emailAccounts.findFirst({
    where: eq(schema.emailAccounts.id, accountId),
  });

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  if (!account.isActive) {
    console.log(`Account ${accountId} is not active, skipping sync`);
    return { skipped: true };
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
    console.log(`Fetched ${messages.length} messages for account ${accountId}`);

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

    console.log(`Sync completed for account ${accountId}: ${newEmailCount} new emails`);

    return { newEmailCount, totalFetched: messages.length };
  } catch (error) {
    console.error(`Sync failed for account ${accountId}:`, error);

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

// Create worker
const worker = new Worker<EmailSyncJob>('email-sync', processEmailSync, {
  connection: getRedisConnection(),
  concurrency: 5,
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});

console.log('Email sync worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down email sync worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down email sync worker...');
  await worker.close();
  process.exit(0);
});
