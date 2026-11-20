import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { logger } from "../src/lib/logger.js";
import { DemoProvider, DemoWebClient } from "../src/providers/demo.provider.js";
import {
  ProviderError,
  type CompanyEnrichmentProvider,
  type EnrichmentInput,
  type EnrichmentResult,
} from "../src/providers/provider.js";
import { EnrichmentQueue } from "../src/queues/enrichment.queue.js";
import { EnrichmentService } from "../src/services/enrichment.service.js";
import type { WebClient } from "../src/services/olostep.service.js";
import { Store } from "../src/store/store.js";
import { EnrichmentWorker } from "../src/workers/enrichment.worker.js";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const CSV = [
  "company_name,domain,contact_email",
  "Acme Cloud,acmecloud.com,ana@acmecloud.com",
  "Acme Cloud,acmecloud.com,raj@acmecloud.com",
  "Globex,globex.io,lee@globex.io",
  "Initech,,omar@gmail.com",
  ",,nobody@yahoo.com",
].join("\n");

const ICP = {
  industries: ["SaaS"],
  locations: ["United States"],
  min_employees: 100,
  max_employees: 2000,
  technologies: ["AWS"],
  funding_stages: [],
  min_funding_usd: null,
  must_be_hiring: false,
};

/** Fake Olostep research: Acme is a great, active fit; Globex is a poor fit; Initech has no data. */
class FakeProvider implements CompanyEnrichmentProvider {
  readonly name = "fake";
  calls: EnrichmentInput[] = [];
  fatal = false;
  delayMs = 0;

  async enrichCompany(input: EnrichmentInput): Promise<EnrichmentResult> {
    this.calls.push(input);
    if (this.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, this.delayMs);
        input.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });
    }
    if (this.fatal) throw new ProviderError("bad key", "invalid_api_key", true);
    const acme = input.domain === "acmecloud.com";
    const globex = input.domain === "globex.io";
    const val = (value: string | string[] | null) =>
      ({
        value,
        status: value ? "verified" : "unavailable",
        sourceUrl: value ? "https://example.com/p" : null,
        note: null,
      }) as const;
    const values: Record<string, string | string[] | null> = acme
      ? {
          industry: "SaaS",
          headquarters: "Denver, United States",
          employee_count: "201-500",
          technology_stack: ["AWS", "React"],
        }
      : globex
        ? {
            industry: "Manufacturing",
            headquarters: "Hamburg, Germany",
            employee_count: "5,000+",
            technology_stack: ["SAP"],
          }
        : {};
    return {
      companyName: input.companyName,
      domain: input.domain,
      fields: Object.fromEntries(input.fields.map((f) => [f.key, val(values[f.key] ?? null)])),
      buyingSignals: acme
        ? [
            {
              signal: "Raised a $30M Series B",
              date: daysAgo(8),
              sourceUrl: "https://news.example.org/acme",
            },
            { signal: "Hiring 10 platform engineers", date: daysAgo(15), sourceUrl: null },
          ]
        : [],
      custom: {},
      sources: ["https://example.com/p"],
      credits: 20,
      providerRef: "answer_test",
    };
  }
}

class FakeWeb implements WebClient {
  scrapes: string[] = [];
  searches: string[] = [];
  async scrape(url: string) {
    this.scrapes.push(url);
    const pages: Record<string, string> = {
      "https://news.example.org/acme": "Acme Cloud raised a $30M Series B to grow its platform.",
      "https://jobs.example.org/acme": "Acme Cloud is hiring 10 platform engineers in Denver.",
    };
    if (!pages[url]) throw new Error("404");
    return { url, title: null, markdown: pages[url]!, credits: 1 };
  }
  async search(query: string) {
    this.searches.push(query);
    return {
      links: [{ url: "https://jobs.example.org/acme", title: null, description: null }],
      credits: 5,
    };
  }
}

function setup(file: string | null = null, credits: number | null = 480) {
  const provider = new FakeProvider();
  const web = new FakeWeb();
  const store = new Store(file, logger);
  const worker = new EnrichmentWorker(
    { live: { provider, web }, demo: { provider: new DemoProvider(0), web: new DemoWebClient() } },
    store,
    { cacheDays: 7, maxEvidenceChecks: 3, maxEvidenceSearches: 2, logger },
  );
  const queue = new EnrichmentQueue(worker, store, logger, 2);
  const service = new EnrichmentService(store, queue, {
    creditsPerResearch: 20,
    maxEvidenceCredits: 13,
    usdPerCredit: 0.0005,
    cacheDays: 7,
    logger,
  });
  const app = createApp({
    config: {
      liveConfigured: true,
      usdPerCredit: 0.0005,
      maxRows: 100,
      maxUploadBytes: 1024 * 1024,
      clientOrigin: "http://localhost:5173",
      trustProxy: false,
      clientDir: null,
    },
    store,
    service,
    checkCredits:
      credits === null ? null : async () => ({ credits, allowUsage: true, plan: "Free" }),
    logger,
  });
  return { app, provider, web, store };
}

type App = ReturnType<typeof setup>["app"];

async function upload(app: App, csv = CSV) {
  const res = await request(app)
    .post("/api/csv/preview")
    .attach("file", Buffer.from(csv), { filename: "accounts.csv", contentType: "text/csv" })
    .expect(201);
  return res.body as { upload_id: string; column_mapping: Record<string, string | null> };
}

async function waitFor(app: App, id: string, statuses: string[]) {
  for (let i = 0; i < 300; i++) {
    const res = await request(app).get(`/api/runs/${id}`).expect(200);
    if (statuses.includes(res.body.status)) return res.body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`run never reached ${statuses.join("/")}`);
}

describe("AccountSignal API", () => {
  it("needs an ICP first and validates it", async () => {
    const { app } = setup();
    const up = await upload(app);
    const noIcp = await request(app)
      .post("/api/runs")
      .send({ upload_id: up.upload_id, column_mapping: up.column_mapping })
      .expect(400);
    expect(noIcp.body.error.message).toMatch(/ideal customer profile/i);
    const empty = await request(app).put("/api/icp").send({}).expect(400);
    expect(empty.body.error.message).toMatch(/at least one/i);
    await request(app)
      .put("/api/icp")
      .send({ ...ICP, min_employees: 500, max_employees: 100 })
      .expect(400);
    const saved = await request(app).put("/api/icp").send(ICP).expect(200);
    expect(saved.body.icp.technologies).toEqual(["AWS"]);
    expect((await request(app).get("/api/icp").expect(200)).body.icp.industries).toEqual(["SaaS"]);
  });

  it("ranks accounts: research → evidence → ICP fit + timing → priority → brief → export", async () => {
    const { app, provider, web } = setup();
    await request(app).put("/api/icp").send(ICP).expect(200);
    const up = await upload(app);
    expect(up.column_mapping).toMatchObject({
      company_name: "company_name",
      website: "domain",
      email: "contact_email",
    });

    const est = await request(app)
      .post("/api/runs/estimate")
      .send({ upload_id: up.upload_id, column_mapping: up.column_mapping })
      .expect(200);
    expect(est.body).toMatchObject({
      companies: 3,
      cached_companies: 0,
      skipped_rows: 1,
      credits_min: 60,
      credits_max: 99,
    });

    const created = await request(app)
      .post("/api/runs")
      .send({ upload_id: up.upload_id, column_mapping: up.column_mapping })
      .expect(202);
    expect(created.body).toMatchObject({
      success: true,
      status: "queued",
      total_rows: 5,
      total_companies: 3,
    });

    const run = await waitFor(app, created.body.run_id, ["completed", "completed_with_errors"]);
    expect(run.status).toBe("completed");
    expect(run.priorities).toEqual({ act_now: 1, nurture: 0, watch: 0, skip: 2 });
    expect(run.signals).toEqual({ total: 2, verified: 2 });
    // 3 research calls + 2 scrapes + 1 search for the unsourced hiring signal.
    expect(run.credits_used).toBe(60 + 2 + 5);
    expect(provider.calls).toHaveLength(3);
    expect(web.searches).toHaveLength(1);

    const { body } = await request(app).get(`/api/runs/${run.id}/accounts`).expect(200);
    expect(
      body.accounts.map((a: { domain: string | null; priority: string }) => [a.domain, a.priority]),
    ).toEqual([
      ["acmecloud.com", "Act now"],
      ["globex.io", "Skip"],
      [null, "Skip"],
    ]);
    const acme = body.accounts[0];
    expect(acme).toMatchObject({
      contacts: 2,
      fit: { score: 100, level: "High Fit" },
      signals: { total: 2, verified: 2 },
    });
    expect(acme.timing.score).toBe(92);
    expect(acme.top_signal).toMatchObject({ type: "funding", evidence: "verified" });
    expect(
      body.rows.find((r: { email: string }) => r.email === "omar@gmail.com").issues[0].code,
    ).toBe("personal_email");

    const detail = await request(app)
      .get(`/api/runs/${run.id}/accounts/${acme.company_id}`)
      .expect(200);
    expect(detail.body.brief.summary).toMatch(/approach now/);
    expect(detail.body.brief.whyNow[0]).toMatch(/Raised a \$30M Series B .*verified/);
    expect(detail.body.signals[1]).toMatchObject({
      checked_url: "https://jobs.example.org/acme",
      source_url: null,
    });
    expect(detail.body.contacts.map((c: { email: string }) => c.email)).toEqual([
      "ana@acmecloud.com",
      "raj@acmecloud.com",
    ]);

    const csv = await request(app).get(`/api/runs/${run.id}/export`).expect(200);
    const header = csv.text.replace(/^\uFEFF/, "").split("\r\n")[0];
    expect(header).toContain("Priority,ICP fit,Timing,Summary,Why now (signals),Investigate next");
    expect(csv.text).toContain("Act now");

    const json = await request(app).get(`/api/runs/${run.id}/export?format=json`).expect(200);
    expect(json.body.accounts).toHaveLength(3);
  });

  it("reuses research on later runs but re-checks the evidence", async () => {
    const { app, provider, web } = setup();
    await request(app).put("/api/icp").send(ICP).expect(200);
    const a = await upload(app);
    const first = await request(app)
      .post("/api/runs")
      .send({ upload_id: a.upload_id, column_mapping: a.column_mapping })
      .expect(202);
    await waitFor(app, first.body.run_id, ["completed"]);
    const b = await upload(app);
    const est = await request(app)
      .post("/api/runs/estimate")
      .send({ upload_id: b.upload_id, column_mapping: b.column_mapping, verify_signals: false })
      .expect(200);
    expect(est.body).toMatchObject({ cached_companies: 3, credits_min: 0, credits_max: 0 });
    const second = await request(app)
      .post("/api/runs")
      .send({ upload_id: b.upload_id, column_mapping: b.column_mapping })
      .expect(202);
    const run = await waitFor(app, second.body.run_id, ["completed"]);
    expect(provider.calls).toHaveLength(3);
    expect(web.scrapes).toHaveLength(4);
    expect(run.credits_used).toBe(7);
    expect(run.progress.from_cache).toBe(3);
  });

  it("runs the bundled demo with no key or credits and ranks every priority", async () => {
    const { app } = setup(null, null);
    const res = await request(app).post("/api/demo").expect(202);
    const run = await waitFor(app, res.body.run_id, ["completed", "completed_with_errors"]);
    expect(run).toMatchObject({ status: "completed", demo: true, credits_used: 0 });
    const { body } = await request(app).get(`/api/runs/${run.id}/accounts`).expect(200);
    const byName = Object.fromEntries(
      body.accounts.map((a: { company_name: string; priority: string }) => [
        a.company_name,
        a.priority,
      ]),
    );
    expect(byName).toEqual({
      "Nimbus Metrics": "Act now",
      "Harbor Ledger": "Nurture",
      Orbitly: "Nurture",
      "Kestrel Health": "Nurture",
      Quillbyte: "Watch",
      "Ferro Logistics": "Skip",
    });
    const conn = await request(app).get("/api/connection").expect(200);
    expect(conn.body).toMatchObject({ configured: false, demo_available: true });
  });

  it("checks the API key for free", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/connection").expect(200);
    expect(res.body).toMatchObject({ configured: true, ok: true, credits: 480, plan: "Free" });
  });

  it("stops on a bad key, cancels, retries and deletes", async () => {
    const { app, provider } = setup();
    await request(app).put("/api/icp").send(ICP).expect(200);
    provider.fatal = true;
    const a = await upload(app);
    const failed = await request(app)
      .post("/api/runs")
      .send({ upload_id: a.upload_id, column_mapping: a.column_mapping })
      .expect(202);
    const run = await waitFor(app, failed.body.run_id, ["failed"]);
    expect(run.error).toBe("bad key");

    provider.fatal = false;
    await request(app).post(`/api/runs/${run.id}/retry`).expect(200);
    expect((await waitFor(app, run.id, ["completed"])).progress.completed).toBe(3);

    provider.delayMs = 5_000;
    const b = await upload(
      app,
      CSV.replace(/acmecloud/g, "acme2")
        .replace(/globex/g, "globex2")
        .replace("Initech", "Initech Two"),
    );
    const slow = await request(app)
      .post("/api/runs")
      .send({ upload_id: b.upload_id, column_mapping: b.column_mapping })
      .expect(202);
    await waitFor(app, slow.body.run_id, ["processing"]);
    const cancelled = await request(app).post(`/api/runs/${slow.body.run_id}/cancel`).expect(200);
    expect(cancelled.body.status).toBe("cancelled");
    await request(app).delete(`/api/runs/${slow.body.run_id}`).expect(204);
    await request(app).get(`/api/runs/${slow.body.run_id}`).expect(404);
  });

  it("keeps the ICP and runs across restarts (JSON file, no database)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "accountsignal-"));
    const file = path.join(dir, "store.json");
    try {
      const first = setup(file);
      await request(first.app).put("/api/icp").send(ICP).expect(200);
      const demo = await request(first.app).post("/api/demo").expect(202);
      await waitFor(first.app, demo.body.run_id, ["completed"]);
      await first.store.flush();

      const second = setup(file);
      await second.store.load();
      expect((await request(second.app).get("/api/icp").expect(200)).body.icp.locations).toEqual([
        "United States",
      ]);
      const run = await request(second.app).get(`/api/runs/${demo.body.run_id}`).expect(200);
      expect(run.body.priorities.act_now).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
