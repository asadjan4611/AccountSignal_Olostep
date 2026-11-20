import type { BuyingSignal, EnrichmentResult } from "../providers/provider.js";
import type {
  ColumnMapping,
  Identification,
  ParsedCsv,
  RowIssue,
} from "../services/csv.service.js";

export type JobStatus =
  | "pending"
  | "validating"
  | "queued"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export const ACTIVE_STATUSES: readonly JobStatus[] = [
  "pending",
  "validating",
  "queued",
  "processing",
];

export type TaskStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type LeadStatus = "pending" | "processing" | "enriched" | "failed" | "skipped" | "cancelled";

/** Stage 1: what a good customer looks like. */
export interface IcpCriteria {
  industries: string[];
  locations: string[];
  minEmployees: number | null;
  maxEmployees: number | null;
  technologies: string[];
  fundingStages: string[];
  minFundingUsd: number | null;
  mustBeHiring: boolean;
}

export type CheckOutcome = "matched" | "missed" | "unknown";

export interface IcpCheck {
  label: string;
  /** Research field the check was judged on. */
  field: string;
  outcome: CheckOutcome;
  /** The researched value it was judged on, if any. */
  value: string | null;
}

export type FitLevel = "High Fit" | "Medium Fit" | "Low Fit";

export interface IcpResult {
  score: number;
  level: FitLevel;
  checks: IcpCheck[];
}

export type SignalType =
  "funding" | "hiring" | "launch" | "expansion" | "leadership" | "partnership" | "other";

/**
 * verified   - the source page loads, mentions the company and supports the claim
 * partial    - the page loads but only partly supports the claim
 * unverified - no source, the page could not be loaded, or it doesn't support the claim
 */
export type EvidenceStatus = "verified" | "partial" | "unverified";

export interface Signal {
  signal: string;
  type: SignalType;
  date: string | null;
  /** Days since the signal, null when undated. */
  ageDays: number | null;
  /** Source claimed by the research. */
  sourceUrl: string | null;
  /** Page actually checked (may come from Search when no source was given). */
  checkedUrl: string | null;
  evidence: EvidenceStatus;
  evidenceNote: string;
  /** Contribution to the timing score. */
  points: number;
}

export interface TimingResult {
  score: number;
  /** Points per signal type (strongest signal of each type counts). */
  breakdown: { type: SignalType; points: number }[];
}

export type Priority = "Act now" | "Nurture" | "Watch" | "Skip";

/** Stage 7: the account brief. Every line is built from researched evidence. */
export interface AccountBrief {
  summary: string;
  whyFit: string[];
  whyNow: string[];
  gaps: string[];
  next: string[];
}

/** One distinct company in a run; every CSV row that shares it points here. */
export interface CompanyTask {
  key: string;
  companyName: string | null;
  domain: string | null;
  leadIds: string[];
  status: TaskStatus;
  companyId: string | null;
  error: string | null;
  fromCache: boolean;
  attempts: number;
  signals: Signal[];
  fit: IcpResult | null;
  timing: TimingResult | null;
  priority: Priority | null;
  brief: AccountBrief | null;
  credits: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface EnrichmentJob {
  id: string;
  filename: string;
  status: JobStatus;
  /** Demo runs use bundled sample data: no API key, no credits. */
  demo: boolean;
  columns: string[];
  mapping: ColumnMapping;
  icp: IcpCriteria;
  verifySignals: boolean;
  tasks: CompanyTask[];
  current: { company: string; task: string } | null;
  credits: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LeadRecord {
  id: string;
  jobId: string;
  rowIndex: number;
  data: Record<string, string>;
  email: string;
  contactName: string;
  companyName: string;
  domain: string | null;
  groupKey: string | null;
  identification: Identification;
  issues: RowIssue[];
  status: LeadStatus;
  companyId: string | null;
  message: string | null;
}

/** Cached company research (Olostep Answers), shared across runs. */
export interface CompanyProfile extends EnrichmentResult {
  id: string;
  cacheKey: string;
  provider: string;
  enrichedAt: string;
}

export interface Upload {
  id: string;
  filename: string;
  csv: ParsedCsv;
  createdAt: number;
}

export type { BuyingSignal };
