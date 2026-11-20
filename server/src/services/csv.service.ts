import Papa from "papaparse";
import { badRequest } from "../lib/errors.js";
import {
  emailDomain,
  isPersonalDomain,
  isValidEmail,
  normalizeCompanyName,
  websiteDomain,
} from "./domain.service.js";

export interface ParsedCsv {
  columns: string[];
  rows: Record<string, string>[];
}

export interface ColumnMapping {
  email: string | null;
  contact_name: string | null;
  company_name: string | null;
  /** Optional: a website/domain column helps when emails are personal or missing. */
  website: string | null;
}

/** How a row's company is identified. */
export type Identification = "email_domain" | "website" | "company_name" | "unidentified";

export type RowIssue =
  | "missing_email"
  | "invalid_email"
  | "personal_email"
  | "duplicate"
  | "missing_company"
  | "unidentified";

export const ISSUE_TEXT: Record<RowIssue, string> = {
  missing_email: "No email address",
  invalid_email: "Email format is invalid",
  personal_email: "Personal email: company identified by its domain or name instead",
  duplicate: "Duplicate of an earlier row",
  missing_company: "No company name",
  unidentified: "Company can't be identified: add a work email, website or company name",
};

export interface LeadDraft {
  rowIndex: number;
  data: Record<string, string>;
  email: string;
  contactName: string;
  companyName: string;
  domain: string | null;
  /** Rows with the same key are the same company and are researched once. */
  groupKey: string | null;
  identification: Identification;
  issues: RowIssue[];
}

export interface ValidationSummary {
  total_rows: number;
  valid_emails: number;
  invalid_emails: number;
  personal_emails: number;
  missing_emails: number;
  duplicates: number;
  companies: number;
  unidentified: number;
}

export function parseCsv(content: string, maxRows: number): ParsedCsv {
  const text = content.replace(/^\uFEFF/, "");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });
  const columns = (result.meta.fields ?? []).filter(Boolean);
  if (columns.length === 0) throw badRequest("The CSV has no header row.");
  if (columns.length > 60) throw badRequest("The CSV has more than 60 columns.");
  const rows = result.data.filter((r) => Object.values(r).some((v) => v));
  if (rows.length === 0) throw badRequest("The CSV has no data rows.");
  if (rows.length > maxRows) {
    throw badRequest(`The CSV has ${rows.length} rows; the limit is ${maxRows} per job.`);
  }
  return { columns, rows };
}

const PATTERNS: Record<keyof ColumnMapping, RegExp[]> = {
  email: [/^(work|business|company|corporate)?[\s_-]*e-?mail([\s_-]*address)?$/i, /e-?mail/i],
  contact_name: [
    /^(contact|full|person|lead)?[\s_-]*name$/i,
    /^(contact|lead|person)/i,
    /first[\s_-]*name/i,
  ],
  company_name: [
    /^(company|organi[sz]ation|account|employer|business)([\s_-]*name)?$/i,
    /(company|organi[sz]ation|employer)(?!.*(e-?mail|site|url|domain))/i,
  ],
  website: [/^(company[\s_-]*)?(website|domain|url|site)$/i, /(website|domain|url)/i],
};

/** Map flexible headers ("Work Email", "email_address", "Organization"...) onto the fields we need. */
export function detectMapping(columns: readonly string[]): ColumnMapping {
  const used = new Set<string>();
  const pick = (key: keyof ColumnMapping): string | null => {
    for (const pattern of PATTERNS[key]) {
      const hit = columns.find((c) => !used.has(c) && pattern.test(c));
      if (hit) {
        used.add(hit);
        return hit;
      }
    }
    return null;
  };
  // Order matters: emails and websites first so "Company Email" isn't taken as the company name.
  const email = pick("email");
  const website = pick("website");
  const company_name = pick("company_name");
  const contact_name = pick("contact_name");
  return { email, contact_name, company_name, website };
}

export function assertMapping(mapping: ColumnMapping, columns: readonly string[]): void {
  for (const [field, column] of Object.entries(mapping)) {
    if (column && !columns.includes(column)) {
      throw badRequest(`Column "${column}" (mapped to ${field}) is not in the file.`);
    }
  }
  if (!mapping.email && !mapping.company_name && !mapping.website) {
    throw badRequest("Map at least an email, company name or website column.");
  }
}

/** Validate every row and work out which company it belongs to. Problems become warnings, never silent drops. */
export function validateRows(csv: ParsedCsv, mapping: ColumnMapping): LeadDraft[] {
  const seenEmails = new Set<string>();
  return csv.rows.map((data, rowIndex) => {
    const email = mapping.email ? (data[mapping.email] ?? "").trim() : "";
    const contactName = mapping.contact_name ? (data[mapping.contact_name] ?? "").trim() : "";
    const companyName = mapping.company_name ? (data[mapping.company_name] ?? "").trim() : "";
    const website = mapping.website ? (data[mapping.website] ?? "").trim() : "";
    const issues: RowIssue[] = [];

    let domain: string | null = null;
    let identification: Identification = "unidentified";
    // A domain/website column is the most reliable identifier, so it wins.
    if (website) {
      const d = websiteDomain(website);
      if (d && !isPersonalDomain(d)) {
        domain = d;
        identification = "website";
      }
    }
    if (mapping.email) {
      // Email is optional when a domain identifies the company.
      if (!email) {
        if (!domain) issues.push("missing_email");
      } else if (!isValidEmail(email)) issues.push("invalid_email");
      else {
        const d = emailDomain(email);
        if (d && isPersonalDomain(d)) issues.push("personal_email");
        else if (!domain && d) {
          domain = d;
          identification = "email_domain";
        }
        const key = email.toLowerCase();
        if (seenEmails.has(key)) issues.push("duplicate");
        seenEmails.add(key);
      }
    }

    const normalizedName = companyName ? normalizeCompanyName(companyName) : "";
    if (!domain && normalizedName) identification = "company_name";
    if (!companyName && !domain) issues.push("missing_company");
    if (identification === "unidentified") issues.push("unidentified");

    const groupKey = domain ? `domain:${domain}` : normalizedName ? `name:${normalizedName}` : null;
    return {
      rowIndex,
      data,
      email,
      contactName,
      companyName,
      domain,
      groupKey,
      identification,
      issues,
    };
  });
}

export function summarize(leads: readonly LeadDraft[]): ValidationSummary {
  const has = (issue: RowIssue) => leads.filter((l) => l.issues.includes(issue)).length;
  return {
    total_rows: leads.length,
    valid_emails: leads.filter(
      (l) => l.email && !l.issues.includes("invalid_email") && !l.issues.includes("personal_email"),
    ).length,
    invalid_emails: has("invalid_email"),
    personal_emails: has("personal_email"),
    missing_emails: has("missing_email"),
    duplicates: has("duplicate"),
    companies: new Set(leads.flatMap((l) => (l.groupKey ? [l.groupKey] : []))).size,
    unidentified: has("unidentified"),
  };
}
