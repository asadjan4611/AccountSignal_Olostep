import type { Logger } from "../lib/logger.js";
import type { CreditsInfo } from "../services/olostep.service.js";
import type { EnrichmentService } from "../services/enrichment.service.js";
import type { Store } from "../store/store.js";

export interface AppConfig {
  liveConfigured: boolean;
  usdPerCredit: number;
  maxRows: number;
  maxUploadBytes: number;
  clientOrigin: string;
  trustProxy: boolean;
  /** Absolute path of the built React app to serve, or null. */
  clientDir: string | null;
}

/** Everything controllers need, passed explicitly so tests can build an app with fakes. */
export interface AppContext {
  config: AppConfig;
  store: Store;
  service: EnrichmentService;
  /** Free credits check, null when no API key is configured. */
  checkCredits: (() => Promise<CreditsInfo>) | null;
  logger: Logger;
}
