import { errorMessage } from "../lib/errors.js";
import type { BuyingSignal } from "../providers/provider.js";
import type { EvidenceStatus, Signal } from "../store/types.js";
import { OlostepError, type WebClient } from "./olostep.service.js";
import { classifySignal, signalPoints } from "./scoring.service.js";

/**
 * The evidence validator. Research can say "they raised a Series B"; this checks it:
 *   1. Is there a source? If not, Olostep Search looks for one.
 *   2. Does the source page load? (Olostep Scrape)
 *   3. Does it mention the company and support the claim? (keyword + number match)
 *   4. How recent is it? (signal date -> age in days)
 * Every signal ends up verified, partial or unverified, with a plain-English note.
 */

const STOPWORDS = new Set(
  "about above after again against also among announced announces around because been before being below between both company company's could during each from further have having into itself just more most other over same should some such than that their them then there these they this those through under until very were what when where which while with would your year years month months recently recent their".split(
    " ",
  ),
);

/** Accepts 2026-03-12, 2026-03, "March 2026", "12 March 2026", "2026". */
export function parseSignalDate(raw: string | null): Date | null {
  if (!raw) return null;
  const t = raw.trim();
  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(t);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 15));
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  m = /(\d{4})/.exec(t);
  if (m) return new Date(Date.UTC(Number(m[1]), 6, 1));
  return null;
}

export function ageInDays(date: Date | null, now = new Date()): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function keywords(signal: string, companyTokens: Set<string>): string[] {
  return [
    ...new Set(
      signal
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(
          (w) => w.length >= 4 && !STOPWORDS.has(w) && !companyTokens.has(w) && !/^\d+$/.test(w),
        ),
    ),
  ];
}

/** Numbers that must appear on the page if the claim states them, e.g. "$18M", "15". */
function figures(signal: string): string[] {
  return [...signal.matchAll(/\d+(?:[.,]\d+)?/g)]
    .map((m) => m[0].replace(",", "."))
    .filter((n) => !/^(19|20)\d\d$/.test(n));
}

export interface SupportCheck {
  status: EvidenceStatus;
  note: string;
}

export function judgeSupport(
  signal: string,
  page: string,
  company: { name: string | null; domain: string | null },
): SupportCheck {
  const hay = page.toLowerCase();
  if (hay.trim().length < 20) return { status: "unverified", note: "The source page was empty" };
  const nameTokens = (company.name ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const domainRoot = company.domain?.split(".")[0]?.toLowerCase() ?? "";
  const mentionsCompany =
    (company.name ? hay.includes(company.name.toLowerCase()) : false) ||
    (domainRoot.length >= 3 && hay.includes(domainRoot)) ||
    (nameTokens.length > 0 && nameTokens.every((t) => hay.includes(t)));

  const words = keywords(signal, new Set([...nameTokens, domainRoot]));
  // Prefix match tolerates word forms: "raised" / "raises", "hiring" / "hires".
  const hits = words.filter((w) => hay.includes(w.slice(0, Math.max(4, w.length - 2))));
  const ratio = words.length ? hits.length / words.length : 0;
  const nums = figures(signal);
  const numbersOk = nums.length === 0 || nums.some((n) => hay.includes(n));

  if (mentionsCompany && ratio >= 0.6 && numbersOk) {
    return { status: "verified", note: "Source page mentions the company and supports the claim" };
  }
  if (!mentionsCompany && ratio >= 0.6) {
    return {
      status: "partial",
      note: "Source supports the claim but doesn't clearly name the company",
    };
  }
  if (mentionsCompany && (ratio >= 0.3 || !numbersOk)) {
    return {
      status: "partial",
      note: numbersOk
        ? "Source mentions the company but only partly supports the claim"
        : "Source mentions the claim but not the same figures",
    };
  }
  return { status: "unverified", note: "Source page doesn't support this claim" };
}

export interface VerifyOptions {
  companyName: string | null;
  domain: string | null;
  /** Scrape at most this many sources per company (1 credit each). */
  maxChecks: number;
  /** Search for missing sources at most this many times per company (5 credits each). */
  maxSearches: number;
  now?: Date;
  signal?: AbortSignal;
}

export async function verifySignals(
  raw: readonly BuyingSignal[],
  web: WebClient | null,
  opts: VerifyOptions,
): Promise<{ signals: Signal[]; credits: number }> {
  const now = opts.now ?? new Date();
  let credits = 0;
  let checks = 0;
  let searches = 0;
  const signals: Signal[] = [];

  // Check the freshest claims first: they matter most for timing.
  const ordered = raw
    .map((s) => ({ s, age: ageInDays(parseSignalDate(s.date), now) }))
    .sort((a, b) => (a.age ?? 9e9) - (b.age ?? 9e9));

  for (const { s, age } of ordered) {
    const base = {
      signal: s.signal,
      type: classifySignal(s.signal),
      date: s.date,
      ageDays: age,
      sourceUrl: s.sourceUrl,
    };
    let checkedUrl: string | null = s.sourceUrl;
    let status: EvidenceStatus = "unverified";
    let note = s.sourceUrl ? "Source not checked" : "No source was given";

    if (!web) {
      note = s.sourceUrl ? "Evidence check is off for this run" : "No source was given";
    } else if (age !== null && age > 365) {
      note = "Older than 12 months, so it doesn't affect timing";
    } else {
      try {
        if (!checkedUrl && searches < opts.maxSearches) {
          searches++;
          const found = await web.search(
            `${opts.companyName ?? opts.domain ?? ""} ${s.signal}`.trim(),
            3,
            opts.signal,
          );
          credits += found.credits;
          checkedUrl = found.links[0]?.url ?? null;
          if (!checkedUrl) note = "No source was given and Search found none";
        }
        if (checkedUrl && checks < opts.maxChecks) {
          checks++;
          const page = await web.scrape(checkedUrl, opts.signal);
          credits += page.credits;
          const verdict = judgeSupport(s.signal, `${page.title ?? ""}\n${page.markdown}`, {
            name: opts.companyName,
            domain: opts.domain,
          });
          status = verdict.status;
          note = s.sourceUrl ? verdict.note : `${verdict.note} (source found with Search)`;
        } else if (checkedUrl) {
          note = "Not checked: evidence limit reached for this company";
        }
      } catch (err) {
        if (opts.signal?.aborted || (err instanceof OlostepError && err.fatal)) throw err;
        note = `Source could not be loaded (${errorMessage(err).slice(0, 80)})`;
      }
    }
    const partial = { ...base, checkedUrl, evidence: status, evidenceNote: note };
    signals.push({ ...partial, points: signalPoints(partial) });
  }
  return { signals, credits };
}
