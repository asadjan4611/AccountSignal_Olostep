import type { FieldResult } from "../providers/provider.js";
import type {
  CheckOutcome,
  CompanyProfile,
  FitLevel,
  IcpCheck,
  IcpCriteria,
  IcpResult,
  Priority,
  Signal,
  SignalType,
  TimingResult,
} from "../store/types.js";

/**
 * The scoring engine. Olostep does the research; these plain, deterministic rules make
 * the GTM decision. No AI call, so scores are free, instant and explainable.
 */

// ── Parsers ────────────────────────────────────────────────────────────────

const MULTIPLIER: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

/** "$25M", "USD 1.2 billion", "€300 million" -> 25_000_000 etc. Currency is not converted. */
export function parseMoney(text: string | null): number | null {
  if (!text) return null;
  const match = /(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|mm|m|million|bn|b|billion)?\b/i.exec(text);
  if (!match?.[1]) return null;
  const n = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n * (match[2] ? (MULTIPLIER[match[2].toLowerCase()] ?? 1) : 1);
}

/** "201-500" -> [201, 500], "8,000+" -> [8000, Infinity], "about 250 (2025)" -> [250, 250]. */
export function parseHeadcount(text: string | null): [number, number] | null {
  if (!text) return null;
  const clean = text.replace(/(\d),(\d{3})/g, "$1$2");
  const num = (n: string, k?: string) => Number(n) * (k ? 1_000 : 1);
  const range = /(\d+(?:\.\d+)?)\s*(k)?\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(k)?/i.exec(clean);
  if (range?.[1] && range[3]) {
    const a = num(range[1], range[2]);
    const b = num(range[3], range[4]);
    return [Math.min(a, b), Math.max(a, b)];
  }
  const single = /(\d+(?:\.\d+)?)\s*(k)?/i.exec(clean);
  if (!single?.[1]) return null;
  const n = num(single[1], single[2]);
  return /\+|more than|over/i.test(clean) ? [n, Infinity] : [n, n];
}

// ── ICP fit ────────────────────────────────────────────────────────────────

const text = (f: FieldResult | undefined): string | null =>
  !f || f.value === null ? null : Array.isArray(f.value) ? f.value.join(", ") : f.value;
const listed = (values: readonly string[]) => values.map((v) => v.trim()).filter(Boolean);
const anyOf = (needles: string[]) => (hay: string) =>
  needles.some((n) => hay.toLowerCase().includes(n.toLowerCase()));

export function criteriaCount(c: IcpCriteria): number {
  return (
    (listed(c.industries).length ? 1 : 0) +
    (listed(c.locations).length ? 1 : 0) +
    (c.minEmployees !== null || c.maxEmployees !== null ? 1 : 0) +
    (listed(c.technologies).length ? 1 : 0) +
    (listed(c.fundingStages).length ? 1 : 0) +
    (c.minFundingUsd !== null ? 1 : 0) +
    (c.mustBeHiring ? 1 : 0)
  );
}

/** Each criterion is matched, missed or unknown. Unknown (no data) never counts as a match. */
export function scoreIcp(
  criteria: IcpCriteria,
  company: Pick<CompanyProfile, "fields">,
): IcpResult {
  const f = company.fields;
  const checks: IcpCheck[] = [];
  const judge = (
    label: string,
    field: string,
    value: string | null,
    test: (v: string) => boolean | null,
  ) => {
    const verdict = value === null ? null : test(value);
    const outcome: CheckOutcome = verdict === null ? "unknown" : verdict ? "matched" : "missed";
    checks.push({ label, field, outcome, value });
  };

  const industries = listed(criteria.industries);
  if (industries.length) {
    const value = text(f.industry);
    judge(`Industry: ${industries.join(" / ")}`, "industry", value, (v) =>
      anyOf(industries)(`${v} ${text(f.description) ?? ""}`),
    );
  }
  const locations = listed(criteria.locations);
  if (locations.length) {
    judge(
      `Location: ${locations.join(" / ")}`,
      "headquarters",
      text(f.headquarters),
      anyOf(locations),
    );
  }
  if (criteria.minEmployees !== null || criteria.maxEmployees !== null) {
    const min = criteria.minEmployees ?? 0;
    const max = criteria.maxEmployees ?? Infinity;
    judge(
      `Employees: ${min.toLocaleString("en")}${max === Infinity ? "+" : `–${max.toLocaleString("en")}`}`,
      "employee_count",
      text(f.employee_count),
      (v) => {
        const range = parseHeadcount(v);
        return range ? range[0] <= max && range[1] >= min : null;
      },
    );
  }
  const tech = listed(criteria.technologies);
  if (tech.length)
    judge(
      `Technology: ${tech.join(" / ")}`,
      "technology_stack",
      text(f.technology_stack),
      anyOf(tech),
    );
  const stages = listed(criteria.fundingStages);
  if (stages.length)
    judge(
      `Funding stage: ${stages.join(" / ")}`,
      "funding_stage",
      text(f.funding_stage),
      anyOf(stages),
    );
  if (criteria.minFundingUsd !== null) {
    const min = criteria.minFundingUsd;
    judge(
      `Funding ≥ $${new Intl.NumberFormat("en", { notation: "compact" }).format(min)}`,
      "total_funding",
      text(f.total_funding),
      (v) => {
        const raised = parseMoney(v);
        return raised === null ? null : raised >= min;
      },
    );
  }
  if (criteria.mustBeHiring) {
    judge(
      "Currently hiring",
      "hiring_activity",
      text(f.hiring_activity),
      (v) => !/\b(not hiring|no open|none|0 open)\b/i.test(v),
    );
  }

  const matched = checks.filter((c) => c.outcome === "matched").length;
  const score = checks.length ? Math.round((matched / checks.length) * 100) : 0;
  const level: FitLevel = score >= 75 ? "High Fit" : score >= 50 ? "Medium Fit" : "Low Fit";
  return { score, level, checks };
}

// ── Timing ─────────────────────────────────────────────────────────────────

export const TYPE_WEIGHT: Record<SignalType, number> = {
  funding: 30,
  hiring: 25,
  launch: 20,
  expansion: 20,
  leadership: 15,
  partnership: 15,
  other: 10,
};

const TYPE_PATTERNS: [SignalType, RegExp][] = [
  [
    "funding",
    /\b(rais(e|ed|es|ing)\b|funding|series [a-h]\b|seed round|investment|valuation|ipo\b)/i,
  ],
  ["hiring", /\b(hiring|hires?\b|recruit|open roles?|job openings?|headcount)/i],
  [
    "leadership",
    /\b(appoint|new (ceo|cto|cfo|coo|chief)|named (ceo|cto|cfo|coo|chief)|joins as|steps down)/i,
  ],
  ["launch", /\b(launch|releas|introduc|unveil|debut|general availability)/i],
  [
    "expansion",
    /\b(expan|new office|open(s|ed|ing)?\b|entering|enters\b|international|new market)/i,
  ],
  ["partnership", /\b(partner|acquir|acquisition|merg|integration with)/i],
];

export function classifySignal(signal: string): SignalType {
  return TYPE_PATTERNS.find(([, re]) => re.test(signal))?.[0] ?? "other";
}

/** Fresh signals matter most; anything over a year old is history, not timing. */
export function recencyFactor(ageDays: number | null): number {
  if (ageDays === null) return 0.2;
  if (ageDays <= 30) return 1;
  if (ageDays <= 90) return 0.7;
  if (ageDays <= 180) return 0.4;
  if (ageDays <= 365) return 0.2;
  return 0;
}

export const EVIDENCE_FACTOR = { verified: 1, partial: 0.7, unverified: 0.4 } as const;

/** 60 weighted points (e.g. a fresh verified funding round plus fresh hiring) = 100. */
const FULL_SCORE_POINTS = 60;

export function signalPoints(s: Pick<Signal, "type" | "ageDays" | "evidence">): number {
  return (
    Math.round(TYPE_WEIGHT[s.type] * recencyFactor(s.ageDays) * EVIDENCE_FACTOR[s.evidence] * 10) /
    10
  );
}

/** The strongest signal of each type counts, so ten hiring posts don't outweigh real variety. */
export function scoreTiming(signals: readonly Signal[]): TimingResult {
  const best = new Map<SignalType, number>();
  for (const s of signals) best.set(s.type, Math.max(best.get(s.type) ?? 0, s.points));
  const breakdown = [...best.entries()]
    .filter(([, points]) => points > 0)
    .map(([type, points]) => ({ type, points }))
    .sort((a, b) => b.points - a.points);
  const total = breakdown.reduce((n, b) => n + b.points, 0);
  return { score: Math.min(100, Math.round((total / FULL_SCORE_POINTS) * 100)), breakdown };
}

// ── Priority ───────────────────────────────────────────────────────────────

export const FIT_THRESHOLD = 60;
export const TIMING_THRESHOLD = 50;

export function priorityOf(fit: number, timing: number): Priority {
  const goodFit = fit >= FIT_THRESHOLD;
  const goodTiming = timing >= TIMING_THRESHOLD;
  if (goodFit && goodTiming) return "Act now";
  if (goodFit) return "Nurture";
  if (goodTiming) return "Watch";
  return "Skip";
}

export const PRIORITY_RANK: Record<Priority, number> = {
  "Act now": 0,
  Nurture: 1,
  Watch: 2,
  Skip: 3,
};
