import { FIELDS } from "../fields/catalog.js";
import { ISSUE_TEXT } from "../services/csv.service.js";
import { PRIORITY_RANK } from "../services/scoring.service.js";
import type {
  CompanyProfile,
  CompanyTask,
  EnrichmentJob,
  IcpCriteria,
  LeadRecord,
  Priority,
} from "../store/types.js";

/** API responses use snake_case; internal models use camelCase. */

export function icpDto(c: IcpCriteria | null) {
  return c
    ? {
        industries: c.industries,
        locations: c.locations,
        min_employees: c.minEmployees,
        max_employees: c.maxEmployees,
        technologies: c.technologies,
        funding_stages: c.fundingStages,
        min_funding_usd: c.minFundingUsd,
        must_be_hiring: c.mustBeHiring,
      }
    : null;
}

export function progressOf(job: EnrichmentJob) {
  const count = (s: CompanyTask["status"]) => job.tasks.filter((t) => t.status === s).length;
  const total = job.tasks.length;
  const done = count("completed") + count("failed") + count("cancelled");
  return {
    total,
    completed: count("completed"),
    processing: count("processing"),
    pending: count("pending"),
    failed: count("failed"),
    cancelled: count("cancelled"),
    from_cache: job.tasks.filter((t) => t.fromCache).length,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

export function runDto(job: EnrichmentJob, leads: readonly LeadRecord[], usdPerCredit: number) {
  const byPriority = (p: Priority) => job.tasks.filter((t) => t.priority === p).length;
  return {
    id: job.id,
    filename: job.filename,
    status: job.status,
    demo: job.demo,
    progress: progressOf(job),
    rows: {
      total: leads.length,
      enriched: leads.filter((l) => l.status === "enriched").length,
      skipped: leads.filter((l) => l.status === "skipped").length,
      failed: leads.filter((l) => l.status === "failed").length,
    },
    priorities: {
      act_now: byPriority("Act now"),
      nurture: byPriority("Nurture"),
      watch: byPriority("Watch"),
      skip: byPriority("Skip"),
    },
    signals: {
      total: job.tasks.reduce((n, t) => n + t.signals.length, 0),
      verified: job.tasks.reduce(
        (n, t) => n + t.signals.filter((s) => s.evidence === "verified").length,
        0,
      ),
    },
    current: job.current,
    icp: icpDto(job.icp),
    verify_signals: job.verifySignals,
    credits_used: job.credits,
    usd_used: job.credits * usdPerCredit,
    error: job.error,
    created_at: job.createdAt,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
  };
}

const fieldValue = (company: CompanyProfile | undefined, key: string) => {
  const f = company?.fields[key];
  return f ? { value: f.value, status: f.status } : null;
};

function signalDto(s: CompanyTask["signals"][number]) {
  return {
    signal: s.signal,
    type: s.type,
    date: s.date,
    age_days: s.ageDays,
    source_url: s.sourceUrl,
    checked_url: s.checkedUrl,
    evidence: s.evidence,
    evidence_note: s.evidenceNote,
    points: s.points,
  };
}

/** One row of the ranked accounts table. */
export function accountRowDto(task: CompanyTask, company: CompanyProfile | undefined) {
  const top = [...task.signals].sort((a, b) => b.points - a.points)[0];
  return {
    key: task.key,
    company_id: task.companyId,
    company_name: company?.companyName ?? task.companyName,
    domain: company?.domain ?? task.domain,
    status: task.status,
    error: task.error,
    contacts: task.leadIds.length,
    from_cache: task.fromCache,
    priority: task.priority,
    fit: task.fit ? { score: task.fit.score, level: task.fit.level } : null,
    timing: task.timing ? { score: task.timing.score } : null,
    top_signal: top && top.points > 0 ? signalDto(top) : null,
    signals: {
      total: task.signals.length,
      verified: task.signals.filter((s) => s.evidence === "verified").length,
    },
    summary: task.brief?.summary ?? null,
    highlights: {
      industry: fieldValue(company, "industry"),
      employee_count: fieldValue(company, "employee_count"),
      headquarters: fieldValue(company, "headquarters"),
      funding_stage: fieldValue(company, "funding_stage"),
    },
  };
}

export function sortAccounts<
  T extends {
    priority: Priority | null;
    fit: { score: number } | null;
    timing: { score: number } | null;
  },
>(rows: T[]): T[] {
  const rank = (r: T) => (r.priority ? PRIORITY_RANK[r.priority] : 9);
  const total = (r: T) => (r.fit?.score ?? 0) + (r.timing?.score ?? 0);
  return [...rows].sort((a, b) => rank(a) - rank(b) || total(b) - total(a));
}

/** Everything about one account in one run: research, evidence, scores and brief. */
export function accountDetailDto(
  job: EnrichmentJob,
  task: CompanyTask,
  company: CompanyProfile,
  contacts: LeadRecord[],
) {
  return {
    run: { id: job.id, filename: job.filename, demo: job.demo, icp: icpDto(job.icp) },
    company_id: company.id,
    company_name: company.companyName ?? task.companyName,
    domain: company.domain ?? task.domain,
    from_cache: task.fromCache,
    researched_at: company.enrichedAt,
    priority: task.priority,
    fit: task.fit,
    timing: task.timing,
    brief: task.brief,
    signals: [...task.signals].sort((a, b) => b.points - a.points).map(signalDto),
    fields: FIELDS.filter((f) => company.fields[f.key]).map((f) => {
      const r = company.fields[f.key]!;
      return {
        key: f.key,
        label: f.label,
        group: f.group,
        value: r.value,
        status: r.status,
        source_url: r.sourceUrl,
        note: r.note,
      };
    }),
    sources: company.sources,
    provider: company.provider,
    provider_ref: company.providerRef,
    credits_used: task.credits,
    contacts: contacts.map((l) => ({ name: l.contactName, email: l.email })),
  };
}

export function leadDto(lead: LeadRecord) {
  return {
    id: lead.id,
    row_index: lead.rowIndex,
    email: lead.email,
    contact_name: lead.contactName,
    company_name: lead.companyName,
    domain: lead.domain,
    identification: lead.identification,
    status: lead.status,
    issues: lead.issues.map((code) => ({ code, text: ISSUE_TEXT[code] })),
    message: lead.message,
    company_id: lead.companyId,
  };
}
