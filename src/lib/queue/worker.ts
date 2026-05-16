/**
 * In-process job worker
 *
 * Runs inside the Next.js server process - NO separate terminal needed!
 * Just start Next.js and jobs process automatically.
 */

import {
  getNextJob,
  completeJob,
  failJob,
  resetStuckJobs,
  cleanupOldJobs,
  getQueueStats,
  type EmailSyncJobData,
  type AIProcessingJobData,
  type NormalizeInboundJobData,
} from './simple-queue';
import { processEmailSync, processAIJob, processNormalizeInbound } from './processors';
import { startBriefScheduler } from '@/lib/brief/scheduler';

let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

// Configuration
const POLL_INTERVAL_MS = 2000; // Check for jobs every 2 seconds
const MAINTENANCE_INTERVAL_MS = 60 * 1000; // Run maintenance every minute
const AI_RATE_LIMIT_DELAY_MS = 1000; // Delay between AI jobs (rate limiting)

let lastAIJobTime = 0;

/**
 * Process a single job
 */
async function processJob(): Promise<boolean> {
  // Priority order: normalize-inbound (real-time) → email-sync → ai-processing
  let job = await getNextJob('normalize-inbound');

  if (!job) {
    job = await getNextJob('email-sync');
  }

  if (!job) {
    // Check AI rate limit before processing AI jobs
    const now = Date.now();
    if (now - lastAIJobTime < AI_RATE_LIMIT_DELAY_MS) {
      return false;
    }
    job = await getNextJob('ai-processing');
  }

  if (!job) {
    return false;
  }

  try {
    // jsonb column — Drizzle returns parsed JS object, no JSON.parse needed.
    // Handle legacy double-encoded jobs gracefully.
    const data = typeof job.data === 'string' ? JSON.parse(job.data) : job.data;

    if (job.type === 'normalize-inbound') {
      const result = await processNormalizeInbound(data as NormalizeInboundJobData);
      await completeJob(job.id, result);
    } else if (job.type === 'email-sync') {
      const result = await processEmailSync(data as EmailSyncJobData);
      await completeJob(job.id, result);
    } else if (job.type === 'ai-processing') {
      lastAIJobTime = Date.now();
      const result = await processAIJob(data as AIProcessingJobData);
      await completeJob(job.id, result);
    }

    return true;
  } catch (error) {
    console.error(`[Worker] Job ${job.id} failed:`, error);
    await failJob(job.id, error instanceof Error ? error : new Error(String(error)));
    return true; // Still return true because we processed something
  }
}

/**
 * Run maintenance tasks
 */
async function runMaintenance(): Promise<void> {
  try {
    // Reset stuck jobs (processing for more than 5 minutes)
    const resetCount = await resetStuckJobs(5 * 60 * 1000);
    if (resetCount > 0) {
      console.log(`[Worker] Reset ${resetCount} stuck jobs`);
    }

    // Clean up old completed/failed jobs (older than 24 hours)
    const cleanedCount = await cleanupOldJobs(24 * 60 * 60 * 1000);
    if (cleanedCount > 0) {
      console.log(`[Worker] Cleaned up ${cleanedCount} old jobs`);
    }
  } catch (error) {
    console.error('[Worker] Maintenance error:', error);
  }
}

/**
 * Start the worker loop
 */
export function startWorker(): void {
  if (isRunning) {
    console.log('[Worker] Already running');
    return;
  }

  console.log('[Worker] Starting in-process job worker...');
  isRunning = true;

  // Main processing loop
  const processLoop = async () => {
    if (!isRunning) return;

    try {
      // Process jobs until none are ready
      let processed = true;
      while (processed && isRunning) {
        processed = await processJob();
      }
    } catch (error) {
      console.error('[Worker] Process loop error:', error);
    }
  };

  // Start the polling interval
  workerInterval = setInterval(processLoop, POLL_INTERVAL_MS);

  // Run maintenance periodically
  setInterval(runMaintenance, MAINTENANCE_INTERVAL_MS);

  // Process immediately on start
  processLoop();

  console.log('[Worker] Job worker started');

  // Start the morning brief scheduler
  startBriefScheduler();
}

/**
 * Stop the worker
 */
export function stopWorker(): void {
  if (!isRunning) return;

  console.log('[Worker] Stopping job worker...');
  isRunning = false;

  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }

  console.log('[Worker] Job worker stopped');
}

/**
 * Check if worker is running
 */
export function isWorkerRunning(): boolean {
  return isRunning;
}

/**
 * Get worker status including queue stats
 */
export async function getWorkerStatus(): Promise<{
  running: boolean;
  stats: Awaited<ReturnType<typeof getQueueStats>>;
}> {
  const stats = await getQueueStats();
  return {
    running: isRunning,
    stats,
  };
}

// Auto-start worker when this module is imported in a server context
// (This won't run in browser bundles)
if (typeof window === 'undefined') {
  // Delay start slightly to allow database to be ready
  setTimeout(() => {
    startWorker();
  }, 1000);
}
