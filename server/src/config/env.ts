import { z } from "zod";

const boolish = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  TRUST_PROXY: boolish.default(false),
  SERVE_CLIENT: boolish.optional(),

  OLOSTEP_API_KEY: z.string().default(""),
  OLOSTEP_BASE_URL: z.url().default("https://api.olostep.com"),
  /** Answers costs 20 credits per request (Olostep docs). */
  OLOSTEP_CREDITS_PER_ANSWER: z.coerce.number().int().min(1).default(20),
  /** USD per credit for estimates ($99 / 200k credits on the Standard plan). */
  OLOSTEP_USD_PER_CREDIT: z.coerce.number().min(0).max(1).default(0.000495),
  OLOSTEP_TIMEOUT_MS: z.coerce.number().int().min(5_000).default(120_000),
  /** Reuse Olostep's stored copy of a source page if newer than this (seconds). */
  OLOSTEP_SCRAPE_MAX_AGE: z.coerce.number().int().min(0).max(604_800).default(86_400),

  /** Evidence checks per company: scrapes (1 credit each) and searches for missing sources (5 each). */
  EVIDENCE_MAX_CHECKS: z.coerce.number().int().min(0).max(10).default(3),
  EVIDENCE_MAX_SEARCHES: z.coerce.number().int().min(0).max(5).default(2),

  /** Companies researched at the same time. Keep it low; Olostep has per-plan concurrency limits. */
  ENRICH_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  MAX_ROWS: z.coerce.number().int().min(1).max(10_000).default(1_000),
  MAX_UPLOAD_MB: z.coerce.number().min(0.1).max(20).default(5),

  /** Where jobs are saved so they survive restarts. Empty = memory only. */
  DATA_FILE: z.string().default(".data/accountsignal.json"),
  /** Delete jobs (and the contact data in them) after this many days. 0 = keep. */
  RETENTION_DAYS: z.coerce.number().min(0).default(30),
  /** Reuse a company's research for this many days instead of paying for it again. 0 = never reuse. */
  CACHE_DAYS: z.coerce.number().min(0).default(7),
});

export type Env = z.infer<typeof EnvSchema>;

/** Treat empty strings in .env as "not set" so defaults apply (DATA_FILE keeps its explicit ""). */
function normalize(raw: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && (entry[1].trim() !== "" || entry[0] === "DATA_FILE"),
    ),
  );
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(normalize(raw));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return parsed.data;
}

export const env = loadEnv();
