import type { CustomQuestion, FieldDef } from "../fields/catalog.js";

/**
 * Business logic depends on this interface, not on Olostep's API. Swap or add providers
 * (a cache, a CRM, another data API) without touching the queue, store or UI.
 */
export interface CompanyEnrichmentProvider {
  readonly name: string;
  enrichCompany(input: EnrichmentInput): Promise<EnrichmentResult>;
}

export interface EnrichmentInput {
  companyName: string | null;
  domain: string | null;
  fields: readonly FieldDef[];
  includeBuyingSignals: boolean;
  customQuestions: readonly CustomQuestion[];
  signal?: AbortSignal;
}

/**
 * verified    - reported by a source, and the field cites that source
 * estimated   - a third-party or model estimate (e.g. revenue), never presented as fact
 * unverified  - reported, but without a field-level citation (only response-level sources)
 * unavailable - could not be found (Olostep returned NOT_FOUND)
 */
export type FieldStatus = "verified" | "estimated" | "unverified" | "unavailable";

export interface FieldResult {
  value: string | string[] | null;
  status: FieldStatus;
  sourceUrl: string | null;
  /** Extra context, e.g. "USD · as of 2025" for money fields. */
  note: string | null;
}

export interface BuyingSignal {
  signal: string;
  date: string | null;
  sourceUrl: string | null;
}

export interface CustomAnswer {
  question: string;
  answer: string | null;
  explanation: string | null;
  sourceUrl: string | null;
  status: FieldStatus;
}

export interface EnrichmentResult {
  companyName: string | null;
  domain: string | null;
  fields: Record<string, FieldResult>;
  buyingSignals: BuyingSignal[];
  custom: Record<string, CustomAnswer>;
  /** Response-level sources: they informed the research, but not necessarily every field. */
  sources: string[];
  credits: number;
  /** Provider's id for this research (Olostep answer id), for debugging and support. */
  providerRef: string | null;
}

/** Errors that will fail every company in the job (bad key, no credits). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly fatal: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
