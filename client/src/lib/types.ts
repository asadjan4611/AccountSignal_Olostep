// Mirrors the API's snake_case responses (server/src/controllers/serializers.ts).

export type FieldValue = string | string[] | number | boolean | null;
export type FieldStatus = "verified" | "estimated" | "unverified" | "unavailable";
export type EvidenceStatus = "verified" | "partial" | "unverified";
export type Priority = "Act now" | "Nurture" | "Watch" | "Skip";
export type SignalType =
  "funding" | "hiring" | "launch" | "expansion" | "leadership" | "partnership" | "other";

export type RunStatus =
  | "pending"
  | "validating"
  | "queued"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export const ACTIVE: readonly RunStatus[] = ["pending", "validating", "queued", "processing"];

export interface AppConfig {
  live_configured: boolean;
  usd_per_credit: number;
  max_rows: number;
  max_upload_mb: number;
}

export interface Connection {
  configured: boolean;
  ok: boolean;
  credits?: number;
  plan?: string | null;
  demo_available: boolean;
  message: string;
}

export interface Icp {
  industries: string[];
  locations: string[];
  min_employees: number | null;
  max_employees: number | null;
  technologies: string[];
  funding_stages: string[];
  min_funding_usd: number | null;
  must_be_hiring: boolean;
}

export interface ColumnMapping {
  email: string | null;
  contact_name: string | null;
  company_name: string | null;
  website: string | null;
}

export interface Issue {
  code: string;
  text: string;
}

export interface Row {
  id: string;
  row_index: number;
  email: string;
  contact_name: string;
  company_name: string;
  domain: string | null;
  identification: "email_domain" | "website" | "company_name" | "unidentified";
  status: "pending" | "processing" | "enriched" | "failed" | "skipped" | "cancelled";
  issues: Issue[];
  message: string | null;
  company_id: string | null;
}

export interface Preview {
  upload_id: string;
  filename: string;
  columns: string[];
  column_mapping: ColumnMapping;
  summary: {
    total_rows: number;
    valid_emails: number;
    invalid_emails: number;
    personal_emails: number;
    missing_emails: number;
    duplicates: number;
    companies: number;
    unidentified: number;
  };
  rows: (Row & { data: Record<string, string> })[];
}

export interface RunConfig {
  upload_id: string;
  column_mapping: ColumnMapping;
  verify_signals: boolean;
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

export interface Run {
  id: string;
  filename: string;
  status: RunStatus;
  demo: boolean;
  progress: {
    total: number;
    completed: number;
    processing: number;
    pending: number;
    failed: number;
    cancelled: number;
    from_cache: number;
    percent: number;
  };
  rows: { total: number; enriched: number; skipped: number; failed: number };
  priorities: { act_now: number; nurture: number; watch: number; skip: number };
  signals: { total: number; verified: number };
  current: { company: string; task: string } | null;
  icp: Icp;
  verify_signals: boolean;
  credits_used: number;
  usd_used: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SignalDto {
  signal: string;
  type: SignalType;
  date: string | null;
  age_days: number | null;
  source_url: string | null;
  checked_url: string | null;
  evidence: EvidenceStatus;
  evidence_note: string;
  points: number;
}

export interface AccountRow {
  key: string;
  company_id: string | null;
  company_name: string | null;
  domain: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  error: string | null;
  contacts: number;
  from_cache: boolean;
  priority: Priority | null;
  fit: { score: number; level: string } | null;
  timing: { score: number } | null;
  top_signal: SignalDto | null;
  signals: { total: number; verified: number };
  summary: string | null;
  highlights: Record<
    "industry" | "employee_count" | "headquarters" | "funding_stage",
    { value: FieldValue; status: FieldStatus } | null
  >;
}

export interface IcpCheck {
  label: string;
  field: string;
  outcome: "matched" | "missed" | "unknown";
  value: string | null;
}

export interface AccountDetail {
  run: { id: string; filename: string; demo: boolean; icp: Icp };
  company_id: string;
  company_name: string | null;
  domain: string | null;
  from_cache: boolean;
  researched_at: string;
  priority: Priority | null;
  fit: { score: number; level: string; checks: IcpCheck[] } | null;
  timing: { score: number; breakdown: { type: SignalType; points: number }[] } | null;
  brief: {
    summary: string;
    whyFit: string[];
    whyNow: string[];
    gaps: string[];
    next: string[];
  } | null;
  signals: SignalDto[];
  fields: {
    key: string;
    label: string;
    group: string;
    value: FieldValue;
    status: FieldStatus;
    source_url: string | null;
    note: string | null;
  }[];
  sources: string[];
  provider: string;
  provider_ref: string | null;
  credits_used: number;
  contacts: { name: string; email: string }[];
}

export interface DashboardStats {
  accounts: number;
  act_now: number;
  verified_signals: number;
  active_runs: number;
  credits_used: number;
}
