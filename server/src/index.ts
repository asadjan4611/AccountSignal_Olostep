import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { DemoProvider, DemoWebClient } from "./providers/demo.provider.js";
import { OlostepEnrichmentProvider } from "./providers/olostep.provider.js";
import { ProviderError, type CompanyEnrichmentProvider } from "./providers/provider.js";
import { EnrichmentQueue } from "./queues/enrichment.queue.js";
import { EnrichmentService } from "./services/enrichment.service.js";
import { OlostepClient } from "./services/olostep.service.js";
import { Store } from "./store/store.js";
import { EnrichmentWorker } from "./workers/enrichment.worker.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

const OLOSTEP_CREDITS_PER_SEARCH = 5;
const OLOSTEP_CREDITS_PER_SCRAPE = 1;

/** Fails fast, and stops the run, when no API key is configured. */
const unconfigured: CompanyEnrichmentProvider = {
  name: "unconfigured",
  enrichCompany: () =>
    Promise.reject(new ProviderError("OLOSTEP_API_KEY is not set", "missing_api_key", true)),
};

async function main(): Promise<void> {
  const store = new Store(env.DATA_FILE ? path.resolve(repoRoot, env.DATA_FILE) : null, logger);
  await store.load();
  store.purge(env.RETENTION_DAYS, env.CACHE_DAYS);

  const client = env.OLOSTEP_API_KEY
    ? new OlostepClient({
        apiKey: env.OLOSTEP_API_KEY,
        baseUrl: env.OLOSTEP_BASE_URL,
        timeoutMs: env.OLOSTEP_TIMEOUT_MS,
        scrapeMaxAgeSeconds: env.OLOSTEP_SCRAPE_MAX_AGE,
      })
    : null;

  const worker = new EnrichmentWorker(
    {
      live: {
        provider: client
          ? new OlostepEnrichmentProvider(client, env.OLOSTEP_CREDITS_PER_ANSWER)
          : unconfigured,
        web: client,
      },
      demo: { provider: new DemoProvider(), web: new DemoWebClient() },
    },
    store,
    {
      cacheDays: env.CACHE_DAYS,
      maxEvidenceChecks: env.EVIDENCE_MAX_CHECKS,
      maxEvidenceSearches: env.EVIDENCE_MAX_SEARCHES,
      logger,
    },
  );
  const queue = new EnrichmentQueue(worker, store, logger, env.ENRICH_CONCURRENCY);
  const service = new EnrichmentService(store, queue, {
    creditsPerResearch: env.OLOSTEP_CREDITS_PER_ANSWER,
    maxEvidenceCredits:
      env.EVIDENCE_MAX_CHECKS * OLOSTEP_CREDITS_PER_SCRAPE +
      env.EVIDENCE_MAX_SEARCHES * OLOSTEP_CREDITS_PER_SEARCH,
    usdPerCredit: env.OLOSTEP_USD_PER_CREDIT,
    cacheDays: env.CACHE_DAYS,
    logger,
  });

  const serveClient = env.SERVE_CLIENT ?? env.NODE_ENV === "production";
  const app = createApp({
    config: {
      liveConfigured: Boolean(client),
      usdPerCredit: env.OLOSTEP_USD_PER_CREDIT,
      maxRows: env.MAX_ROWS,
      maxUploadBytes: Math.round(env.MAX_UPLOAD_MB * 1024 * 1024),
      clientOrigin: env.CLIENT_ORIGIN,
      trustProxy: env.TRUST_PROXY,
      clientDir: serveClient ? path.join(repoRoot, "client/dist") : null,
    },
    store,
    service,
    checkCredits: client ? () => client.creditsInfo() : null,
    logger,
  });

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, storage: env.DATA_FILE || "memory only" },
      "AccountSignal API ready",
    );
    if (!client) logger.warn("OLOSTEP_API_KEY is not set: demo mode only");
  });

  const resumed = service.resume(Boolean(client));
  if (resumed) logger.info({ resumed }, "resumed unfinished runs");
  const purgeTimer = setInterval(
    () => store.purge(env.RETENTION_DAYS, env.CACHE_DAYS),
    6 * 3_600_000,
  );
  purgeTimer.unref();

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    const force = setTimeout(() => process.exit(1), 10_000).unref();
    server.close();
    server.closeAllConnections();
    await queue.shutdown();
    await store.flush();
    clearTimeout(force);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  logger.fatal(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
