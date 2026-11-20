import { RESEARCH_FIELDS } from "../fields/catalog.js";
import { errorMessage } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { ProviderError, type CompanyEnrichmentProvider } from "../providers/provider.js";
import { buildBrief } from "../services/brief.service.js";
import { verifySignals } from "../services/evidence.service.js";
import { OlostepError, type WebClient } from "../services/olostep.service.js";
import { priorityOf, scoreIcp, scoreTiming } from "../services/scoring.service.js";
import { newId, type Store } from "../store/store.js";
import type { CompanyProfile, CompanyTask, EnrichmentJob } from "../store/types.js";

/** Bump when the research prompt or fields change, so old cached research isn't reused. */
const RESEARCH_VERSION = "v1";

export function cacheKeyFor(
  task: Pick<CompanyTask, "key">,
  job: Pick<EnrichmentJob, "demo">,
): string {
  return `${job.demo ? "demo" : "live"}|${RESEARCH_VERSION}|${task.key}`;
}

export interface ResearchBackend {
  provider: CompanyEnrichmentProvider;
  /** Used to check evidence (Search + Scrape). */
  web: WebClient | null;
}

export interface WorkerOptions {
  cacheDays: number;
  maxEvidenceChecks: number;
  maxEvidenceSearches: number;
  logger: Logger;
}

/**
 * Processes one company: research (Answers) → validate evidence (Search + Scrape)
 * → score (ICP fit, timing, priority) → write the account brief.
 */
export class EnrichmentWorker {
  constructor(
    private readonly backends: { live: ResearchBackend; demo: ResearchBackend },
    private readonly store: Store,
    private readonly opts: WorkerOptions,
  ) {}

  async process(job: EnrichmentJob, task: CompanyTask, signal: AbortSignal): Promise<void> {
    if (signal.aborted || task.status !== "pending") return;
    const backend = job.demo ? this.backends.demo : this.backends.live;
    const label = task.companyName ?? task.domain ?? task.key;
    const leads = this.store.getLeads(job.id).filter((l) => task.leadIds.includes(l.id));
    const stage = (text: string) => {
      job.current = { company: label, task: text };
      this.store.save();
    };

    task.status = "processing";
    task.attempts++;
    task.startedAt = new Date().toISOString();
    for (const lead of leads) lead.status = "processing";
    stage("Researching the company with Olostep Answers");

    try {
      // 1. Research (reused for CACHE_DAYS: repeat runs cost nothing here).
      const cacheKey = cacheKeyFor(task, job);
      let profile: CompanyProfile | undefined = this.store.findCachedCompany(
        cacheKey,
        this.opts.cacheDays,
      );
      task.fromCache = Boolean(profile);
      let credits = 0;
      if (!profile) {
        const result = await backend.provider.enrichCompany({
          companyName: task.companyName,
          domain: task.domain,
          fields: RESEARCH_FIELDS,
          includeBuyingSignals: true,
          customQuestions: [],
          signal,
        });
        profile = {
          ...result,
          id: newId("co"),
          cacheKey,
          provider: backend.provider.name,
          enrichedAt: new Date().toISOString(),
        };
        this.store.saveCompany(profile);
        credits += result.credits;
      }

      // 2. Evidence: always re-checked, because timing depends on today's date.
      stage(
        job.verifySignals
          ? "Checking signal sources with Olostep Search + Scrape"
          : "Reading signals",
      );
      const evidence = await verifySignals(
        profile.buyingSignals,
        job.verifySignals ? backend.web : null,
        {
          companyName: profile.companyName ?? task.companyName,
          domain: profile.domain ?? task.domain,
          maxChecks: this.opts.maxEvidenceChecks,
          maxSearches: this.opts.maxEvidenceSearches,
          signal,
        },
      );
      credits += evidence.credits;

      // 3. Scores and 4. brief.
      stage("Scoring ICP fit and timing");
      const fit = scoreIcp(job.icp, profile);
      const timing = scoreTiming(evidence.signals);
      const priority = priorityOf(fit.score, timing.score);
      task.companyName = profile.companyName ?? task.companyName;
      task.companyId = profile.id;
      task.signals = evidence.signals;
      task.fit = fit;
      task.timing = timing;
      task.priority = priority;
      task.brief = buildBrief({
        companyName: task.companyName ?? label,
        fit,
        timing,
        priority,
        signals: evidence.signals,
      });
      task.credits += credits;
      job.credits += credits;
      task.status = "completed";
      task.error = null;
      for (const lead of leads) {
        lead.status = "enriched";
        lead.companyId = profile.id;
        lead.message = null;
      }
    } catch (rawErr) {
      const err =
        rawErr instanceof OlostepError
          ? new ProviderError(rawErr.message, rawErr.code, rawErr.fatal)
          : rawErr;
      if (signal.aborted && !(err instanceof ProviderError && err.fatal)) {
        task.status = "pending";
        for (const lead of leads) lead.status = "pending";
        throw err;
      }
      task.status = "failed";
      task.error = errorMessage(err);
      for (const lead of leads) {
        lead.status = "failed";
        lead.message = task.error;
      }
      this.opts.logger.warn({ err, company: label, jobId: job.id }, "account research failed");
      if (err instanceof ProviderError && err.fatal) throw err;
    } finally {
      task.finishedAt = task.status === "pending" ? null : new Date().toISOString();
      if (job.current?.company === label) job.current = null;
      this.store.save();
    }
  }
}
