import pLimit, { type LimitFunction } from "p-limit";
import { errorMessage } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { ProviderError } from "../providers/provider.js";
import type { Store } from "../store/store.js";
import type { EnrichmentJob } from "../store/types.js";
import type { EnrichmentWorker } from "../workers/enrichment.worker.js";

/**
 * In-process background queue. One task per distinct company; a single concurrency
 * limit is shared by all jobs so the Olostep account is never flooded. The HTTP request
 * that creates a job returns immediately; progress is read from the store.
 *
 * No Redis needed. For multiple server instances, swap this class for BullMQ or similar:
 * the worker and store don't change.
 */
export class EnrichmentQueue {
  private readonly limit: LimitFunction;
  private readonly controllers = new Map<string, AbortController>();
  private readonly runs = new Map<string, Promise<void>>();
  private readonly cancelled = new Set<string>();

  constructor(
    private readonly worker: EnrichmentWorker,
    private readonly store: Store,
    private readonly logger: Logger,
    concurrency: number,
  ) {
    this.limit = pLimit(concurrency);
  }

  isActive(jobId: string): boolean {
    return this.runs.has(jobId);
  }

  enqueue(jobId: string): void {
    if (this.runs.has(jobId)) return;
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    const run = this.run(jobId, controller.signal)
      .catch((err: unknown) => this.logger.error({ err, jobId }, "job crashed"))
      .finally(() => {
        this.runs.delete(jobId);
        this.controllers.delete(jobId);
        this.cancelled.delete(jobId);
        this.store.save();
      });
    this.runs.set(jobId, run);
  }

  async cancel(jobId: string): Promise<void> {
    this.cancelled.add(jobId);
    this.controllers.get(jobId)?.abort();
    await this.runs.get(jobId);
    const job = this.store.getJob(jobId);
    if (job && !["completed", "completed_with_errors", "failed"].includes(job.status)) {
      this.finish(job, "cancelled", null);
    }
  }

  /** Stop work on shutdown; unfinished jobs resume on the next start. */
  async shutdown(): Promise<void> {
    for (const controller of this.controllers.values()) controller.abort();
    await Promise.allSettled(this.runs.values());
  }

  private async run(jobId: string, signal: AbortSignal): Promise<void> {
    // Pick the job up on the next tick, like a real queue: the HTTP response reports "queued".
    await new Promise((resolve) => setImmediate(resolve));
    const job = this.store.getJob(jobId);
    if (!job || signal.aborted) return;
    job.status = "processing";
    job.startedAt ??= new Date().toISOString();
    this.store.save();

    let fatal: ProviderError | null = null;
    const pending = job.tasks.filter((t) => t.status === "pending");
    await Promise.all(
      pending.map((task) =>
        this.limit(async () => {
          if (signal.aborted) return;
          try {
            await this.worker.process(job, task, signal);
          } catch (err) {
            if (err instanceof ProviderError && err.fatal && !fatal) {
              fatal = err;
              this.controllers.get(jobId)?.abort();
            }
          }
        }),
      ),
    );

    if (fatal) return this.finish(job, "failed", errorMessage(fatal));
    if (this.cancelled.has(jobId)) return this.finish(job, "cancelled", null);
    if (signal.aborted) return; // Shutdown: leave it for resume.
    const failed = job.tasks.some((t) => t.status === "failed");
    this.finish(job, failed ? "completed_with_errors" : "completed", null);
  }

  private finish(job: EnrichmentJob, status: EnrichmentJob["status"], error: string | null): void {
    job.status = status;
    job.error = error;
    job.current = null;
    job.finishedAt = new Date().toISOString();
    if (status === "cancelled" || status === "failed") {
      const leads = this.store.getLeads(job.id);
      for (const task of job.tasks) {
        if (task.status !== "pending" && task.status !== "processing") continue;
        task.status = "cancelled";
        for (const lead of leads) {
          if (task.leadIds.includes(lead.id)) {
            lead.status = "cancelled";
            lead.message = error ?? "Job was cancelled";
          }
        }
      }
    }
    this.store.save();
    this.logger.info({ jobId: job.id, status }, "job finished");
  }
}
