import { setTimeout as sleep } from "node:timers/promises";

export interface RetryOptions {
  /** Number of retries after the first attempt. */
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  shouldRetry: (err: unknown, attempt: number) => boolean;
  /** Optional server hint (e.g. Retry-After) that overrides the computed delay. */
  delayHintMs?: (err: unknown) => number | undefined;
}

/** Retries `fn` with exponential backoff and full jitter. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8_000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= opts.retries || !opts.shouldRetry(err, attempt) || opts.signal?.aborted) {
        throw err;
      }
      const hint = opts.delayHintMs?.(err);
      const backoff = Math.random() * Math.min(max, base * 2 ** attempt);
      await sleep(hint ?? backoff, undefined, { signal: opts.signal });
    }
  }
}
