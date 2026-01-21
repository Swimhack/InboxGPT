/**
 * Next.js Instrumentation
 *
 * This file runs when the Next.js server starts.
 * We use it to auto-start the background job worker.
 */

export async function register() {
  // Only run on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import to avoid bundling in edge runtime
    const { startWorker } = await import('@/lib/queue/worker');

    console.log('[Instrumentation] Starting background job worker...');
    startWorker();
    console.log('[Instrumentation] Background job worker started!');
  }
}
