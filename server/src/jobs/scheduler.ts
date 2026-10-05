import logger from '../utils/logger';
import * as depositService from '../services/depositService';
import * as instructionService from '../services/instructionService';

interface JobResult {
  name: string;
  ran: boolean;
  detail: string;
}

/**
 * The recurring work the bank has to do whether or not anyone is looking.
 *
 * Two jobs, both of which move money, so both are written to be safe to run
 * more than once: a fixed deposit that has already been paid out is skipped by
 * its status transition, and a standing instruction advances `nextRunDate`
 * inside the same write that debits the account. Re-running after a crash
 * therefore cannot double-pay.
 *
 * Deliberately no cron library. `setInterval` plus a run-on-boot call is enough
 * for two jobs, and adding a scheduler dependency would be a larger surface
 * than the problem deserves.
 */
const runScheduledWork = async (): Promise<JobResult[]> => {
  const results: JobResult[] = [];

  // Maturities first. A deposit that pays out today may be the balance an
  // instruction scheduled for today would have drawn on, and paying a
  // customer first is the ordering that avoids an avoidable insufficient-funds
  // failure.
  try {
    const matured = await depositService.processMaturities();
    results.push({
      name: 'deposit maturities',
      ran: true,
      detail: `${matured.matured} matured, ${matured.failed} failed`,
    });
  } catch (error) {
    results.push({
      name: 'deposit maturities',
      ran: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    logger.error('Deposit maturity sweep failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const due = await instructionService.runDueInstructions();
    results.push({
      name: 'standing instructions',
      ran: true,
      detail: `${due.succeeded}/${due.due} executed, ${due.failed} failed`,
    });
  } catch (error) {
    results.push({
      name: 'standing instructions',
      ran: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    logger.error('Standing instruction sweep failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return results;
};

/** How often the sweep runs. Five minutes is well inside the shortest
 *  instruction interval that matters (a weekly debit) while staying cheap. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export const startScheduler = (): NodeJS.Timeout => {
  // Run once on boot, but never block startup on it: the first sweep can take a
  // moment if the ledger is large, and the HTTP server should already be
  // accepting requests by then.
  void runScheduledWork().then((results) => {
    for (const r of results) {
      logger.info(`scheduler boot: ${r.name} — ${r.detail}`);
    }
  });

  const timer = setInterval(() => {
    void runScheduledWork().then((results) => {
      // Only log when something actually happened. A quiet sweep every five
      // minutes would otherwise fill the log with identical lines.
      for (const r of results) {
        if (!r.ran || !/^(0|0\/0) /.test(r.detail)) {
          logger.info(`scheduler: ${r.name} — ${r.detail}`);
        }
      }
    });
  }, SWEEP_INTERVAL_MS);

  // Do not hold the event loop open on the timer's account.
  timer.unref();

  return timer;
};

export const stopScheduler = (timer: NodeJS.Timeout): void => {
  clearInterval(timer);
  logger.info('Scheduler stopped');
};

export { runScheduledWork };
