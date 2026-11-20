import { DEMO_CSV, DEMO_ICP } from "../demo/dataset.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type { EnrichmentQueue } from "../queues/enrichment.queue.js";
import { newId, type Store } from "../store/store.js";
import {
  ACTIVE_STATUSES,
  type CompanyTask,
  type EnrichmentJob,
  type IcpCriteria,
  type LeadRecord,
} from "../store/types.js";
import type { IcpInput, RunConfig } from "../validators/job.schema.js";
import { cacheKeyFor } from "../workers/enrichment.worker.js";
import {
  assertMapping,
  detectMapping,
  parseCsv,
  validateRows,
  type ColumnMapping,
  type LeadDraft,
} from "./csv.service.js";

export interface EnrichmentServiceOptions {
  creditsPerResearch: number;
  /** Worst-case evidence credits per company (scrapes + searches). */
  maxEvidenceCredits: number;
  usdPerCredit: number;
  cacheDays: number;
  logger: Logger;
}

export interface CostEstimate {
  companies: number;
  cached_companies: number;
  skipped_rows: number;
  credits_min: number;
  credits_max: number;
  usd_min: number;
  usd_max: number;
  credits_per_company: { research: number; evidence_max: number };
  usd_per_credit: number;
}

export const toIcp = (i: IcpInput): IcpCriteria => ({
  industries: i.industries,
  locations: i.locations,
  minEmployees: i.min_employees,
  maxEmployees: i.max_employees,
  technologies: i.technologies,
  fundingStages: i.funding_stages,
  minFundingUsd: i.min_funding_usd,
  mustBeHiring: i.must_be_hiring,
});

/** Orchestrates runs: build them from an upload, estimate cost, queue, retry, delete. */
export class EnrichmentService {
  constructor(
    private readonly store: Store,
    private readonly queue: EnrichmentQueue,
    private readonly opts: EnrichmentServiceOptions,
  ) {}

  private build(args: {
    filename: string;
    columns: string[];
    mapping: ColumnMapping;
    drafts: LeadDraft[];
    icp: IcpCriteria;
    verifySignals: boolean;
    demo: boolean;
  }): { job: EnrichmentJob; leads: LeadRecord[] } {
    const id = newId("run");
    const leads: LeadRecord[] = args.drafts.map((d) => ({
      id: newId("lead"),
      jobId: id,
      rowIndex: d.rowIndex,
      data: d.data,
      email: d.email,
      contactName: d.contactName,
      companyName: d.companyName,
      domain: d.domain,
      groupKey: d.groupKey,
      identification: d.identification,
      issues: d.issues,
      status: d.groupKey ? "pending" : "skipped",
      companyId: null,
      message: d.groupKey ? null : "Company could not be identified",
    }));

    // One research task per distinct company; every row of that company shares it.
    const tasks = new Map<string, CompanyTask>();
    for (const lead of leads) {
      if (!lead.groupKey) continue;
      const existing = tasks.get(lead.groupKey);
      if (existing) {
        existing.leadIds.push(lead.id);
        existing.companyName ??= lead.companyName || null;
        continue;
      }
      tasks.set(lead.groupKey, {
        key: lead.groupKey,
        companyName: lead.companyName || null,
        domain: lead.domain,
        leadIds: [lead.id],
        status: "pending",
        companyId: null,
        error: null,
        fromCache: false,
        attempts: 0,
        signals: [],
        fit: null,
        timing: null,
        priority: null,
        brief: null,
        credits: 0,
        startedAt: null,
        finishedAt: null,
      });
    }

    const job: EnrichmentJob = {
      id,
      filename: args.filename,
      status: "queued",
      demo: args.demo,
      columns: args.columns,
      mapping: args.mapping,
      icp: args.icp,
      verifySignals: args.verifySignals,
      tasks: [...tasks.values()],
      current: null,
      credits: 0,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    };
    return { job, leads };
  }

  // ── ICP ──────────────────────────────────────────────────────────────────
  getIcp(): IcpCriteria | null {
    return this.store.getIcp();
  }

  saveIcp(input: IcpInput): IcpCriteria {
    const icp = toIcp(input);
    this.store.setIcp(icp);
    return icp;
  }

  private requireIcp(): IcpCriteria {
    const icp = this.store.getIcp();
    if (!icp) throw badRequest("Define your ideal customer profile first.");
    return icp;
  }

  // ── Runs ─────────────────────────────────────────────────────────────────
  private fromUpload(config: RunConfig, demo: boolean) {
    const upload = this.store.getUpload(config.upload_id);
    if (!upload) throw notFound("Upload (it may have expired; upload the file again)");
    assertMapping(config.column_mapping, upload.csv.columns);
    return this.build({
      filename: upload.filename,
      columns: upload.csv.columns,
      mapping: config.column_mapping,
      drafts: validateRows(upload.csv, config.column_mapping),
      icp: this.requireIcp(),
      verifySignals: config.verify_signals,
      demo,
    });
  }

  /** What the run will cost, before anything is spent. */
  estimate(config: RunConfig): CostEstimate {
    const { job, leads } = this.fromUpload(config, false);
    const cached = job.tasks.filter((t) =>
      this.store.findCachedCompany(cacheKeyFor(t, job), this.opts.cacheDays),
    ).length;
    const research = (job.tasks.length - cached) * this.opts.creditsPerResearch;
    const evidenceMax = config.verify_signals ? job.tasks.length * this.opts.maxEvidenceCredits : 0;
    return {
      companies: job.tasks.length,
      cached_companies: cached,
      skipped_rows: leads.filter((l) => l.status === "skipped").length,
      credits_min: research,
      credits_max: research + evidenceMax,
      usd_min: research * this.opts.usdPerCredit,
      usd_max: (research + evidenceMax) * this.opts.usdPerCredit,
      credits_per_company: {
        research: this.opts.creditsPerResearch,
        evidence_max: config.verify_signals ? this.opts.maxEvidenceCredits : 0,
      },
      usd_per_credit: this.opts.usdPerCredit,
    };
  }

  createRun(config: RunConfig): EnrichmentJob {
    const { job, leads } = this.fromUpload(config, false);
    return this.start(job, leads, config.upload_id);
  }

  /** The bundled demo: fictional companies, real pipeline, no API key, no credits. */
  createDemoRun(): EnrichmentJob {
    const csv = parseCsv(DEMO_CSV, 100);
    const mapping = detectMapping(csv.columns);
    const { job, leads } = this.build({
      filename: "demo-accounts.csv",
      columns: csv.columns,
      mapping,
      drafts: validateRows(csv, mapping),
      icp: DEMO_ICP,
      verifySignals: true,
      demo: true,
    });
    return this.start(job, leads, null);
  }

  private start(job: EnrichmentJob, leads: LeadRecord[], uploadId: string | null): EnrichmentJob {
    if (job.tasks.length === 0) {
      throw badRequest("No rows have an identifiable company. Check the column mapping.");
    }
    this.store.createJob(job, leads);
    // The raw CSV isn't needed once the run holds the mapped rows.
    if (uploadId) this.store.deleteUpload(uploadId);
    this.queue.enqueue(job.id);
    this.opts.logger.info(
      { runId: job.id, companies: job.tasks.length, demo: job.demo },
      "run created",
    );
    return job;
  }

  getJob(id: string): EnrichmentJob {
    const job = this.store.getJob(id);
    if (!job) throw notFound("Run");
    return job;
  }

  async cancel(id: string): Promise<EnrichmentJob> {
    const job = this.getJob(id);
    if (!ACTIVE_STATUSES.includes(job.status)) throw conflict("This run has already finished");
    await this.queue.cancel(id);
    return job;
  }

  retry(id: string): EnrichmentJob {
    const job = this.getJob(id);
    if (this.queue.isActive(id)) throw conflict("This run is still going");
    const leads = this.store.getLeads(id);
    const retryable = job.tasks.filter((t) => t.status === "failed" || t.status === "cancelled");
    if (retryable.length === 0) throw conflict("There is nothing to retry in this run");
    for (const task of retryable) {
      task.status = "pending";
      task.error = null;
      for (const lead of leads) {
        if (task.leadIds.includes(lead.id)) {
          lead.status = "pending";
          lead.message = null;
        }
      }
    }
    job.status = "queued";
    job.error = null;
    job.finishedAt = null;
    this.store.save();
    this.queue.enqueue(id);
    return job;
  }

  async delete(id: string): Promise<void> {
    this.getJob(id);
    if (this.queue.isActive(id)) await this.queue.cancel(id);
    this.store.deleteJob(id);
  }

  /** Continue runs that were in progress when the server stopped. */
  resume(liveAvailable: boolean): number {
    let resumed = 0;
    for (const job of this.store.listJobs()) {
      if (!ACTIVE_STATUSES.includes(job.status) || (!job.demo && !liveAvailable)) continue;
      for (const task of job.tasks) if (task.status === "processing") task.status = "pending";
      for (const lead of this.store.getLeads(job.id))
        if (lead.status === "processing") lead.status = "pending";
      this.queue.enqueue(job.id);
      resumed++;
    }
    return resumed;
  }
}
