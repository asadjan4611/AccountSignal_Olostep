import { describe, expect, it, vi } from "vitest";
import { judgeSupport, parseSignalDate, verifySignals } from "../src/services/evidence.service.js";
import { OlostepClient, OlostepError, type WebClient } from "../src/services/olostep.service.js";

const now = new Date("2026-11-20T00:00:00Z");
const company = { name: "Nimbus Metrics", domain: "nimbusmetrics.com" };

describe("parseSignalDate", () => {
  it("understands the date formats research returns", () => {
    expect(parseSignalDate("2026-03-12")?.toISOString().slice(0, 10)).toBe("2026-03-12");
    expect(parseSignalDate("2026-03")?.toISOString().slice(0, 7)).toBe("2026-03");
    expect(parseSignalDate("March 2026")?.getUTCFullYear()).toBe(2026);
    expect(parseSignalDate(null)).toBeNull();
    expect(parseSignalDate("recently")).toBeNull();
  });
});

describe("judgeSupport", () => {
  const page =
    "# Nimbus Metrics raises $40M Series B\nNimbus Metrics has raised a $40M Series B led by Northwind Ventures to expand.";

  it("verifies when the page names the company and supports the claim and its figures", () => {
    expect(
      judgeSupport("Raised a $40M Series B led by Northwind Ventures", page, company).status,
    ).toBe("verified");
  });
  it("downgrades when the figures don't match", () => {
    expect(
      judgeSupport("Raised a $90M Series B led by Northwind Ventures", page, company),
    ).toMatchObject({
      status: "partial",
    });
  });
  it("rejects unrelated or empty pages", () => {
    expect(judgeSupport("Opened a Tokyo office", page, company).status).toBe("unverified");
    expect(judgeSupport("Raised a Series B", "", company).status).toBe("unverified");
  });
});

describe("verifySignals", () => {
  const pages: Record<string, string> = {
    "https://news.example.org/a":
      "Nimbus Metrics raised a $40M Series B led by Northwind Ventures.",
    "https://found.example.org/b":
      "Nimbus Metrics launched an AI incident assistant for on-call teams.",
  };
  const web: WebClient = {
    scrape: vi.fn(async (url: string) => {
      if (!pages[url]) throw new Error("404");
      return { url, title: null, markdown: pages[url]!, credits: 1 };
    }),
    search: vi.fn(async () => ({
      links: [{ url: "https://found.example.org/b", title: null, description: null }],
      credits: 5,
    })),
  };

  it("scrapes sources, searches for missing ones, skips stale ones and counts credits", async () => {
    const { signals, credits } = await verifySignals(
      [
        {
          signal: "Raised a $40M Series B led by Northwind Ventures",
          date: "2026-11-05",
          sourceUrl: "https://news.example.org/a",
        },
        { signal: "Launched an AI incident assistant", date: "2026-10-01", sourceUrl: null },
        {
          signal: "Announced a partnership with a cloud provider",
          date: "2026-09-15",
          sourceUrl: "https://dead.example.org/x",
        },
        {
          signal: "Raised a seed round",
          date: "2023-01-01",
          sourceUrl: "https://news.example.org/old",
        },
      ],
      web,
      { companyName: company.name, domain: company.domain, maxChecks: 3, maxSearches: 2, now },
    );
    expect(signals.map((s) => [s.type, s.evidence, s.ageDays])).toEqual([
      ["funding", "verified", 15],
      ["launch", "verified", 50],
      ["partnership", "unverified", 66],
      ["funding", "unverified", 1419],
    ]);
    expect(signals[1]?.checkedUrl).toBe("https://found.example.org/b");
    expect(signals[1]?.evidenceNote).toMatch(/found with Search/);
    expect(signals[2]?.evidenceNote).toMatch(/could not be loaded/);
    expect(signals[3]).toMatchObject({
      points: 0,
      evidenceNote: expect.stringMatching(/older than 12 months/i),
    });
    expect(credits).toBe(1 + 5 + 1); // the failed scrape and the stale signal cost nothing
  });

  it("marks everything unverified when evidence checks are off", async () => {
    const { signals, credits } = await verifySignals(
      [{ signal: "Hiring engineers", date: "2026-11-01", sourceUrl: "https://x.example.org" }],
      null,
      { companyName: "X", domain: "x.example", maxChecks: 3, maxSearches: 2, now },
    );
    expect(signals[0]).toMatchObject({
      evidence: "unverified",
      evidenceNote: "Evidence check is off for this run",
    });
    expect(credits).toBe(0);
  });
});

describe("OlostepClient extras", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("checks credits for free and calls Search and Scrape with the documented shapes", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(200, {
          credits: 480,
          allow_usage: true,
          active_subscription: { display_name: "Free" },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          credits_consumed: 5,
          result: { links: [{ url: "https://a.example", title: "A" }] },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          url_to_scrape: "https://a.example",
          credits_consumed: 1,
          result: { markdown_content: "# A", page_metadata: { title: "A" } },
        }),
      );
    const client = new OlostepClient({ apiKey: "k", fetchImpl, scrapeMaxAgeSeconds: 3600 });

    expect(await client.creditsInfo()).toEqual({ credits: 480, allowUsage: true, plan: "Free" });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.olostep.com/user/credits/info");
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("GET");

    expect(await client.search("nimbus funding", 3)).toEqual({
      links: [{ url: "https://a.example", title: "A", description: null }],
      credits: 5,
    });
    expect(JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)).toEqual({
      query: "nimbus funding",
      limit: 3,
    });

    expect(await client.scrape("https://a.example")).toEqual({
      url: "https://a.example",
      title: "A",
      markdown: "# A",
      credits: 1,
    });
    expect(JSON.parse(fetchImpl.mock.calls[2]?.[1]?.body as string)).toMatchObject({
      url_to_scrape: "https://a.example",
      formats: ["markdown"],
      max_age: 3600,
    });
  });

  it("reports a bad key as fatal", async () => {
    const client = new OlostepClient({
      apiKey: "bad",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 402 })),
    });
    const err = await client.creditsInfo().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OlostepError);
    expect((err as OlostepError).fatal).toBe(true);
  });
});
