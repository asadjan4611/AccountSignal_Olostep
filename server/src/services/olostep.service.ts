import { z } from "zod";
import { errorMessage, isAbortError } from "../lib/errors.js";
import { withRetry } from "../lib/retry.js";

/**
 * Thin client for the three Olostep endpoints AccountSignal uses, plus the free
 * credits check. It knows HTTP, retries and response shapes, nothing about accounts.
 *
 *   POST /v1/answers   research a company, structured JSON + sources   (20 credits)
 *   POST /v1/searches  find pages on the web                          (5 credits)
 *   POST /v1/scrapes   read one page as markdown                       (1 credit)
 *   GET  /user/credits/info                                            (free)
 */
export class OlostepError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "OlostepError";
  }

  /** Bad key or no credits: every following request would fail too. */
  get fatal(): boolean {
    return this.status === 401 || this.status === 402 || this.status === 403;
  }
}

export interface Answer {
  id: string | null;
  json: unknown;
  sources: string[];
}

export interface ScrapedPage {
  url: string;
  title: string | null;
  markdown: string;
  credits: number;
}

export interface SearchLink {
  url: string;
  title: string | null;
  description: string | null;
}

export interface CreditsInfo {
  credits: number;
  allowUsage: boolean;
  plan: string | null;
}

/** What the evidence validator needs: lets demo mode and tests swap in canned pages. */
export interface WebClient {
  scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage>;
  search(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<{ links: SearchLink[]; credits: number }>;
}

const str = z
  .string()
  .nullish()
  .transform((v) => v ?? null);

const AnswerResponse = z.object({
  id: z.string().nullish(),
  result: z
    .object({ json_content: z.string().nullish(), sources: z.array(z.string()).nullish() })
    .nullish(),
});
const ScrapeResponse = z.object({
  url_to_scrape: z.string().nullish(),
  result: z
    .object({
      markdown_content: str,
      page_metadata: z.object({ title: str }).nullish(),
    })
    .nullish(),
  credits_consumed: z.number().nullish(),
});
const SearchResponse = z.object({
  credits_consumed: z.number().nullish(),
  result: z
    .object({
      links: z.array(z.object({ url: z.string(), title: str, description: str })).nullish(),
    })
    .nullish(),
});
const CreditsResponse = z.object({
  credits: z.number().nullish(),
  allow_usage: z.boolean().nullish(),
  active_subscription: z.object({ display_name: str }).nullish(),
});

export interface OlostepClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  /** Reuse Olostep's stored copy of a page if newer than this (scrapes only). */
  scrapeMaxAgeSeconds?: number;
  fetchImpl?: typeof fetch;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const httpUrl = (u: string) => /^https?:\/\//i.test(u);

export class OlostepClient implements WebClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OlostepClientOptions) {
    this.baseUrl = (opts.baseUrl ?? "https://api.olostep.com").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async answer(
    task: string,
    jsonFormat: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Answer> {
    const body = await this.request(
      "POST",
      "/v1/answers",
      { task, json_format: jsonFormat },
      signal,
    );
    const parsed = AnswerResponse.safeParse(body);
    if (!parsed.success)
      throw new OlostepError("Unexpected Answers response", null, "bad_response", false);
    const raw = parsed.data.result?.json_content;
    let json: unknown = null;
    if (raw) {
      try {
        json = JSON.parse(raw);
      } catch {
        throw new OlostepError("Olostep returned malformed JSON content", null, "bad_json", true);
      }
    }
    return {
      id: parsed.data.id ?? null,
      json,
      sources: (parsed.data.result?.sources ?? []).filter(httpUrl),
    };
  }

  async scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage> {
    const body = await this.request(
      "POST",
      "/v1/scrapes",
      {
        url_to_scrape: url,
        formats: ["markdown"],
        remove_css_selectors: "default",
        max_age: this.opts.scrapeMaxAgeSeconds ?? 86_400,
      },
      signal,
    );
    const parsed = ScrapeResponse.parse(body);
    return {
      url: parsed.url_to_scrape ?? url,
      title: parsed.result?.page_metadata?.title ?? null,
      markdown: parsed.result?.markdown_content ?? "",
      credits: parsed.credits_consumed ?? 1,
    };
  }

  async search(query: string, limit: number, signal?: AbortSignal) {
    const body = await this.request("POST", "/v1/searches", { query, limit }, signal);
    const parsed = SearchResponse.parse(body);
    return {
      links: (parsed.result?.links ?? []).filter((l) => httpUrl(l.url)),
      credits: parsed.credits_consumed ?? 5,
    };
  }

  /** Free pre-flight check: is the key valid, and how many credits are left? */
  async creditsInfo(signal?: AbortSignal): Promise<CreditsInfo> {
    const body = await this.request("GET", "/user/credits/info", undefined, signal, 0);
    const parsed = CreditsResponse.parse(body);
    return {
      credits: parsed.credits ?? 0,
      allowUsage: parsed.allow_usage ?? true,
      plan: parsed.active_subscription?.display_name ?? null,
    };
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    payload: unknown,
    signal?: AbortSignal,
    retries = this.opts.retries ?? 3,
  ): Promise<unknown> {
    return withRetry(
      async () => {
        const timeout = AbortSignal.timeout(this.opts.timeoutMs ?? 120_000);
        let res: Response;
        try {
          res = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers: {
              Authorization: `Bearer ${this.opts.apiKey}`,
              Accept: "application/json",
              ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
            },
            body: payload === undefined ? undefined : JSON.stringify(payload),
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
        } catch (err) {
          if (signal?.aborted) throw err;
          const timedOut = isAbortError(err);
          throw new OlostepError(
            timedOut ? "Olostep did not answer in time" : `Network error: ${errorMessage(err)}`,
            null,
            timedOut ? "timeout" : "network_error",
            true,
          );
        }
        if (!res.ok) throw await toError(res);
        return res.json();
      },
      {
        retries,
        baseDelayMs: 1_500,
        maxDelayMs: 20_000,
        signal,
        shouldRetry: (err) => err instanceof OlostepError && err.retryable,
        delayHintMs: (err) => (err instanceof OlostepError ? err.retryAfterMs : undefined),
      },
    );
  }
}

async function toError(res: Response): Promise<OlostepError> {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 300) || res.statusText;
  let code = `http_${res.status}`;
  try {
    const body = JSON.parse(text) as {
      message?: string;
      code?: string;
      error?: { message?: string; code?: string } | string;
    };
    const e = typeof body.error === "object" ? body.error : undefined;
    message = e?.message ?? body.message ?? (typeof body.error === "string" ? body.error : message);
    code = e?.code ?? body.code ?? code;
  } catch {
    // Not JSON; keep the raw text.
  }
  if (res.status === 401 || res.status === 402 || res.status === 403) {
    return new OlostepError(
      "Olostep rejected the API key or the account is out of credits. Check OLOSTEP_API_KEY.",
      res.status,
      "invalid_api_key_or_credits",
      false,
    );
  }
  const retryAfter = Number(res.headers.get("retry-after"));
  return new OlostepError(
    `Olostep ${res.status}: ${message}`,
    res.status,
    code,
    RETRYABLE.has(res.status),
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : undefined,
  );
}
