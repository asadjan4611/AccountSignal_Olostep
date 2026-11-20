import { setTimeout as sleep } from "node:timers/promises";
import { DEMO_NAME_ONLY, demoCompanies } from "../demo/dataset.js";
import { normalizeCompanyName } from "../services/domain.service.js";
import type { ScrapedPage, SearchLink, WebClient } from "../services/olostep.service.js";
import type { CompanyEnrichmentProvider, EnrichmentInput, EnrichmentResult } from "./provider.js";

/**
 * Demo provider: serves the bundled fictional dataset instead of calling Olostep.
 * It only knows the demo companies, so it can never produce made-up data about real ones.
 */
export class DemoProvider implements CompanyEnrichmentProvider {
  readonly name = "demo";

  constructor(private readonly delayMs = 500) {}

  async enrichCompany(input: EnrichmentInput): Promise<EnrichmentResult> {
    await sleep(this.delayMs, undefined, { signal: input.signal });
    const companies = demoCompanies();
    const domain =
      input.domain ?? DEMO_NAME_ONLY[normalizeCompanyName(input.companyName ?? "")] ?? null;
    const company = domain ? companies[domain] : undefined;
    if (!company) {
      throw new Error("Not in the demo dataset. Add OLOSTEP_API_KEY to research real companies.");
    }
    return {
      companyName: company.name,
      domain,
      fields: Object.fromEntries(
        input.fields.map((f) => [
          f.key,
          company.fields[f.key] ?? {
            value: null,
            status: "unavailable",
            sourceUrl: null,
            note: null,
          },
        ]),
      ),
      buyingSignals: company.signals,
      custom: {},
      sources: [
        ...new Set(
          Object.values(company.fields).flatMap((f) => (f.sourceUrl ? [f.sourceUrl] : [])),
        ),
      ].slice(0, 6),
      credits: 0,
      providerRef: "demo",
    };
  }
}

/** Canned pages for the evidence validator; unknown URLs "fail to load" like a dead link. */
export class DemoWebClient implements WebClient {
  async scrape(url: string): Promise<ScrapedPage> {
    await sleep(150);
    const page = Object.values(demoCompanies()).find((c) => c.pages[url])?.pages[url];
    if (!page) throw new Error("demo page unavailable");
    return {
      url,
      title: page.split("\n")[0]?.replace(/^#\s*/, "") ?? null,
      markdown: page,
      credits: 0,
    };
  }

  async search(query: string): Promise<{ links: SearchLink[]; credits: number }> {
    await sleep(150);
    const links: SearchLink[] =
      /nimbus/i.test(query) && /assistant|launch/i.test(query)
        ? [
            {
              url: "https://search.example.org/nimbus-ai-assistant",
              title: "Nimbus Metrics launches AI incident assistant",
              description: null,
            },
          ]
        : [];
    return { links, credits: 0 };
  }
}
