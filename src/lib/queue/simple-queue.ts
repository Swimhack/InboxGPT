/**
 * Simple SQLite-based job queue - NO Redis required!
 *
 * This replaces BullMQ/Redis with a simple, self-contained queue system.
 * Jobs are stored in SQLite and processed in-process.
 */

import { db, schema } from '../db';
import { eq, and, or, lte, sql } from 'drizzle-orm';
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

export interface NormalizeInboundJobData {
  webhookEventId: string;
}

export type JobType = 'email-sync' | 'ai-processing' | 'normalize-inbound';
export type JobData = EmailSyncJobData | AIProcessingJobData | NormalizeInboundJobData;
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
    data: data as unknown as Record<string, unknown>,
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

// Get the next job to process.
//
// The claim is ATOMIC: a single UPDATE with a FOR UPDATE SKIP LOCKED subquery
// selects and locks the next eligible job in one statement, so two concurrent
// workers (or two app machines) can never claim the same job. The previous
// select-then-update implementation had a race window between the two queries.
export async function getNextJob(type?: JobType): Promise<schema.Job | null> {
  const typeFilter = type ? sql` AND type = ${type}` : sql``;

  const result = await db.execute(sql`
    UPDATE jobs SET
      status = 'processing',
      started_at = now(),
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND (scheduled_for IS NULL OR scheduled_for <= now())${typeFilter}
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  // Map snake_case row → Drizzle Job shape
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    data: row.data,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    error: row.error,
    result: row.result,
    scheduledFor: row.scheduled_for ? new Date(row.scheduled_for as string) : null,
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    createdAt: new Date(row.created_at as string),
  } as schema.Job;
}

// Mark job as completed
export async function completeJob(jobId: string, result?: unknown): Promise<void> {
  await db.update(schema.jobs)
    .set({
      status: 'completed',
      completedAt: new Date(),
      result: result ? (result as unknown as Record<string, unknown>) : null,
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
      'normalize-inbound': { pending: 0, processing: 0 },
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
