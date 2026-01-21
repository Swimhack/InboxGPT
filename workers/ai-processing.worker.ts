import { Worker, Job } from 'bullmq';
import { db, schema } from '../src/lib/db';
import { eq } from 'drizzle-orm';
import { getAIClient } from '../src/lib/ai/client';
import { getRedisConnection, type AIProcessingJob } from '../src/lib/queue';

async function processAIJob(job: Job<AIProcessingJob>) {
  const { emailId, tasks } = job.data;

  console.log(`Processing AI tasks for email ${emailId}: ${tasks.join(', ')}`);

  // Get email from database
  const email = await db.query.emails.findFirst({
    where: eq(schema.emails.id, emailId),
  });

  if (!email) {
    throw new Error(`Email ${emailId} not found`);
  }

  // Skip if already processed
  if (email.aiProcessedAt) {
    console.log(`Email ${emailId} already processed, skipping`);
    return { skipped: true };
  }

  const aiClient = getAIClient();
  const updates: Partial<typeof schema.emails.$inferInsert> = {};

  try {
    // Get email content
    const subject = email.subject || '(No Subject)';
    const body = email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '';

    if (!body) {
      console.log(`Email ${emailId} has no body content, skipping AI processing`);
      return { skipped: true, reason: 'no_content' };
    }

    // Process tasks
    if (tasks.includes('summarize') || tasks.includes('categorize')) {
      const result = await aiClient.summarize(subject, body);

      updates.aiSummary = result.summary;
      updates.aiCategory = result.category;
      updates.aiPriority = result.priority;

      console.log(`Summarized email ${emailId}: ${result.category}, ${result.priority}`);
    }

    if (tasks.includes('suggest-replies')) {
      const senderName = email.fromName || email.fromAddress;
      const result = await aiClient.generateReplies(subject, body, senderName);

      if (result.replies.length > 0) {
        updates.aiSuggestedReplies = JSON.stringify(result.replies);
        console.log(`Generated ${result.replies.length} reply suggestions for email ${emailId}`);
      }
    }

    // Update email with AI results
    updates.aiProcessedAt = new Date();
    updates.updatedAt = new Date();

    await db.update(schema.emails).set(updates).where(eq(schema.emails.id, emailId));

    console.log(`AI processing completed for email ${emailId}`);

    return {
      success: true,
      summary: updates.aiSummary,
      category: updates.aiCategory,
      priority: updates.aiPriority,
      hasReplies: !!updates.aiSuggestedReplies,
    };
  } catch (error) {
    console.error(`AI processing failed for email ${emailId}:`, error);

    // Don't mark as processed so it can be retried
    throw error;
  }
}

// Create worker
const worker = new Worker<AIProcessingJob>('ai-processing', processAIJob, {
  connection: getRedisConnection(),
  concurrency: 3, // Lower concurrency due to API rate limits
  limiter: {
    max: 10,
    duration: 60000, // 10 requests per minute
  },
});

worker.on('completed', (job) => {
  console.log(`AI job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`AI job ${job?.id} failed:`, error);
});

worker.on('error', (error) => {
  console.error('AI worker error:', error);
});

console.log('AI processing worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down AI processing worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down AI processing worker...');
  await worker.close();
  process.exit(0);
});
