/**
 * Job Queue System
 *
 * This is a simple SQLite-based queue that replaces Redis/BullMQ.
 * NO external dependencies required - just start Next.js and it works!
 *
 * Features:
 * - Jobs stored in SQLite (same database as everything else)
 * - In-process worker (no separate terminal window)
 * - Automatic retries with exponential backoff
 * - Rate limiting for AI jobs
 * - Maintenance tasks (cleanup, stuck job recovery)
 */

// Re-export everything from simple-queue for compatibility
export {
  addJob,
  addEmailSyncJob,
  addAIProcessingJob,
  getNextJob,
  completeJob,
  failJob,
  getQueueStats,
  cleanupOldJobs,
  resetStuckJobs,
  type EmailSyncJobData,
  type AIProcessingJobData,
  type JobType,
  type JobData,
  type JobStatus,
} from './simple-queue';

// Re-export worker functions
export {
  startWorker,
  stopWorker,
  isWorkerRunning,
  getWorkerStatus,
} from './worker';

// Re-export processors (for direct use if needed)
export { processEmailSync, processAIJob } from './processors';
