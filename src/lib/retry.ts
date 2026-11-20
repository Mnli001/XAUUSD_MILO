const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs fn up to `attempts` times, waiting delayMs × attempt number between tries. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; delayMs: number; onRetry?: (attempt: number, error: unknown) => void },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= opts.attempts) throw e;
      opts.onRetry?.(attempt, e);
      await sleep(opts.delayMs * attempt);
    }
  }
}
