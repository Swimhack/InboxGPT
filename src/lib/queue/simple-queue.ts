/**
 * Simple SQLite-based job queue - NO Redis required!
 *
 * This replaces BullMQ/Redis with a simple, self-contained queue system.
 * Jobs are stored in SQLite and processed in-process.
 */

import { db, schema } from '../db';
import { eq, and, or, isNull, lte, asc } from 'drizzle-orm';
import { generateId } from '../utils';

// Job types (same interface as before, for compatibility)
export interface EmailSyncJobData {
  accountId: string;
  userId: string;
  type: 'full' | 'incremental';
}

export interface AIProcessingJobData {
  emailId: string;
  userId: string;
  tasks: Array<'summarize' | 'categorize' | 'suggest-replies'>;
}

export type JobType = 'email-sync' | 'ai-processing';
export type JobData = EmailSyncJobData | AIProcessingJobData;
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Add a job to the queue
export async function addJob<T extends JobData>(
  type: JobType,
  data: T,
  options: {
    priority?: number;
    maxAttempts?: number;
    delayMs?: number;
  } = {}
): Promise<string> {
  const id = generateId();
  const now = new Date();
  const scheduledFor = options.delayMs
    ? new Date(now.getTime() + options.delayMs)
    : now;

  await db.insert(schema.jobs).values({
    id,
    type,
    data: JSON.stringify(data),
    status: 'pending',
    priority: options.priority ?? 0,
    maxAttempts: options.maxAttempts ?? 3,
    attempts: 0,
    createdAt: now,
    scheduledFor,
  });

  return id;
}

// Convenience functions (backwards compatible with old API)
export async function addEmailSyncJob(data: EmailSyncJobData): Promise<string> {
  return addJob('email-sync', data, { priority: 10 }); // Higher priority for email sync
}

export async function addAIProcessingJob(data: AIProcessingJobData): Promise<string> {
  return addJob('ai-processing', data, { priority: 5 });
}

// Get the next job to process
export async function getNextJob(type?: JobType): Promise<schema.Job | null> {
  const now = new Date();

  const conditions = [
    eq(schema.jobs.status, 'pending'),
    or(
      isNull(schema.jobs.scheduledFor),
      lte(schema.jobs.scheduledFor, now)
    ),
  ];

  if (type) {
    conditions.push(eq(schema.jobs.type, type));
  }

  const job = await db.query.jobs.findFirst({
    where: and(...conditions),
    orderBy: [
      // Higher priority first, then oldest first
      asc(schema.jobs.priority),
      asc(schema.jobs.createdAt),
    ],
  });

  if (!job) return null;

  // Mark as processing
  await db.update(schema.jobs)
    .set({
      status: 'processing',
      startedAt: now,
      attempts: job.attempts + 1,
    })
    .where(eq(schema.jobs.id, job.id));

  return { ...job, attempts: job.attempts + 1, status: 'processing', startedAt: now };
}

// Mark job as completed
export async function completeJob(jobId: string, result?: unknown): Promise<void> {
  await db.update(schema.jobs)
    .set({
      status: 'completed',
      completedAt: new Date(),
      result: result ? JSON.stringify(result) : null,
    })
    .where(eq(schema.jobs.id, jobId));
}

// Mark job as failed
export async function failJob(jobId: string, error: Error | string): Promise<void> {
  const job = await db.query.jobs.findFirst({
    where: eq(schema.jobs.id, jobId),
  });

  if (!job) return;

  const errorMessage = typeof error === 'string' ? error : error.message;
  const shouldRetry = job.attempts < job.maxAttempts;

  await db.update(schema.jobs)
    .set({
      status: shouldRetry ? 'pending' : 'failed',
      error: errorMessage,
      // If retrying, schedule for 30 seconds from now (exponential backoff)
      scheduledFor: shouldRetry
        ? new Date(Date.now() + Math.pow(2, job.attempts) * 5000)
        : job.scheduledFor,
    })
    .where(eq(schema.jobs.id, jobId));
}

// Get queue statistics
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  byType: Record<JobType, { pending: number; processing: number }>;
}> {
  const allJobs = await db.query.jobs.findMany();

  const stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    byType: {
      'email-sync': { pending: 0, processing: 0 },
      'ai-processing': { pending: 0, processing: 0 },
    } as Record<JobType, { pending: number; processing: number }>,
  };

  for (const job of allJobs) {
    if (job.status === 'pending') stats.pending++;
    if (job.status === 'processing') stats.processing++;
    if (job.status === 'completed') stats.completed++;
    if (job.status === 'failed') stats.failed++;

    const jobType = job.type as JobType;
    if (job.status === 'pending') stats.byType[jobType].pending++;
    if (job.status === 'processing') stats.byType[jobType].processing++;
  }

  return stats;
}

// Clean up old completed/failed jobs (run periodically)
export async function cleanupOldJobs(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);

  const result = await db.delete(schema.jobs)
    .where(
      and(
        or(
          eq(schema.jobs.status, 'completed'),
          eq(schema.jobs.status, 'failed')
        ),
        lte(schema.jobs.completedAt, cutoff)
      )
    );

  return result.rowCount ?? 0;
}

// Reset stuck jobs (jobs that have been processing for too long)
export async function resetStuckJobs(processingTimeoutMs: number = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - processingTimeoutMs);

  const result = await db.update(schema.jobs)
    .set({ status: 'pending', error: 'Job timed out and was reset' })
    .where(
      and(
        eq(schema.jobs.status, 'processing'),
        lte(schema.jobs.startedAt, cutoff)
      )
    );

  return result.rowCount ?? 0;
}
