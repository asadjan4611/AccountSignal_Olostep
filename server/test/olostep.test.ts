import { describe, expect, it, vi } from "vitest";
import { fieldsFor } from "../src/fields/catalog.js";
import { OlostepEnrichmentProvider } from "../src/providers/olostep.provider.js";
import { ProviderError } from "../src/providers/provider.js";
import { OlostepClient } from "../src/services/olostep.service.js";
import { buildJsonFormat } from "../src/validators/company.schema.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function answer(content: unknown) {
  return json(200, {
    id: "answer_123",
    result: {
      json_content: JSON.stringify(content),
      sources: ["https://acme.com/about", "javascript:alert(1)", "https://news.example.org/acme"],
    },
  });
}

const fields = fieldsFor(["industry", "founders", "annual_revenue", "employee_count", "ceo"]);

describe("json_format", () => {
  it("asks for value, basis and source for every field, plus signals and custom answers", () => {
    const format = buildJsonFormat(fields, true, [
      { id: "q1", question: "Uses Kubernetes?", answerType: "yes_no" },
    ]);
    expect(format.industry).toEqual({ value: "", basis: "", source_url: "" });
    expect(format.founders).toEqual({ value: [""], basis: "", source_url: "" });
    expect(format.annual_revenue).toEqual({
      value: "",
      currency: "",
      basis: "",
      as_of: "",
      source_url: "",
    });
    expect(format.buying_signals).toEqual([{ signal: "", date: "", source_url: "" }]);
    expect(format.custom_answers).toEqual({ q1: { answer: "", explanation: "", source_url: "" } });
  });
});

describe("OlostepEnrichmentProvider", () => {
  it("calls /v1/answers and maps statuses: verified, estimated, unverified, unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      answer({
        company_name: "Acme Technologies",
        domain: "acme.com",
        industry: { value: "SaaS", basis: "reported", source_url: "https://acme.com/about" },
        founders: {
          value: ["John Smith (CEO)", "David Brown (CTO)", "John Smith (CEO)"],
          basis: "reported",
          source_url: "",
        },
        annual_revenue: {
          value: "$20M",
          currency: "USD",
          basis: "estimated",
          as_of: "2025",
          source_url: "https://example.com/r",
        },
        employee_count: { value: "NOT_FOUND", basis: "NOT_FOUND", source_url: "" },
        ceo: "John Smith",
        buying_signals: [
          {
            signal: "Raised a Series B",
            date: "2026-03-01",
            source_url: "https://news.example.org/acme",
          },
          { signal: "NOT_FOUND", date: "", source_url: "" },
        ],
        custom_answers: {
          q1: {
            answer: "yes, they do",
            explanation: "Job posts mention k8s",
            source_url: "https://acme.com/jobs",
          },
        },
      }),
    );
    const provider = new OlostepEnrichmentProvider(
      new OlostepClient({ apiKey: "k", fetchImpl }),
      20,
    );
    const result = await provider.enrichCompany({
      companyName: "Acme",
      domain: "acme.com",
      fields,
      includeBuyingSignals: true,
      customQuestions: [{ id: "q1", question: "Do they use Kubernetes?", answerType: "yes_no" }],
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.olostep.com/v1/answers");
    const body = JSON.parse(init?.body as string);
    expect(body.task).toContain("acme.com");
    expect(body.task).not.toMatch(/@/); // no contact emails leave the server
    expect(body.json_format.industry).toEqual({ value: "", basis: "", source_url: "" });

    expect(result.companyName).toBe("Acme Technologies");
    expect(result.fields.industry).toEqual({
      value: "SaaS",
      status: "verified",
      sourceUrl: "https://acme.com/about",
      note: null,
    });
    expect(result.fields.founders).toMatchObject({
      value: ["John Smith (CEO)", "David Brown (CTO)"],
      status: "unverified",
    });
    expect(result.fields.annual_revenue).toMatchObject({
      value: "$20M",
      status: "estimated",
      note: "USD · as of 2025",
    });
    expect(result.fields.employee_count).toMatchObject({ value: null, status: "unavailable" });
    expect(result.fields.ceo).toMatchObject({ value: "John Smith", status: "unverified" });
    expect(result.buyingSignals).toEqual([
      {
        signal: "Raised a Series B",
        date: "2026-03-01",
        sourceUrl: "https://news.example.org/acme",
      },
    ]);
    expect(result.custom.q1).toMatchObject({ answer: "Yes", status: "verified" });
    expect(result.sources).toEqual(["https://acme.com/about", "https://news.example.org/acme"]);
    expect(result.credits).toBe(20);
  });

  it("retries rate limits and fails fast on a bad key", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("slow down", { status: 429, headers: { "retry-after": "0.01" } }),
      )
      .mockResolvedValueOnce(answer({ company_name: "Acme", industry: { value: "SaaS" } }));
    const provider = new OlostepEnrichmentProvider(
      new OlostepClient({ apiKey: "k", fetchImpl }),
      20,
    );
    const ok = await provider.enrichCompany({
      companyName: "Acme",
      domain: null,
      fields,
      includeBuyingSignals: false,
      customQuestions: [],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(ok.fields.industry?.value).toBe("SaaS");

    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 402 }));
    const bad = new OlostepEnrichmentProvider(
      new OlostepClient({ apiKey: "k", fetchImpl: denied }),
      20,
    );
    const err = await bad
      .enrichCompany({
        companyName: "Acme",
        domain: null,
        fields,
        includeBuyingSignals: false,
        customQuestions: [],
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).fatal).toBe(true);
    expect(denied).toHaveBeenCalledTimes(1);
  });
});
