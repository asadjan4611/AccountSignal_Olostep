import type { FieldResult } from "../providers/provider.js";
import type { IcpCriteria } from "../store/types.js";

/**
 * Demo mode data. All companies are FICTIONAL (*.example domains) and clearly labelled as
 * demo data in the UI. They run through the real pipeline (evidence checks, scoring, brief),
 * so developers can see everything without an API key or credits.
 * Dates are relative to "now" so the timing scores stay meaningful whenever the demo runs.
 */

export const DEMO_ICP: IcpCriteria = {
  industries: ["SaaS"],
  locations: ["United States", "USA"],
  minEmployees: 100,
  maxEmployees: 2000,
  technologies: ["AWS", "Kubernetes"],
  fundingStages: ["Series A", "Series B", "Series C", "Series D"],
  minFundingUsd: null,
  mustBeHiring: false,
};

export const DEMO_CSV = [
  "company_name,domain,contact_email",
  "Nimbus Metrics,nimbusmetrics.example,ana@nimbusmetrics.example",
  "Nimbus Metrics,nimbusmetrics.example,raj@nimbusmetrics.example",
  "Harbor Ledger,harborledger.example,lee@harborledger.example",
  "Quillbyte,quillbyte.example,mia@quillbyte.example",
  "Orbitly,orbitly.example,sam@orbitly.example",
  "Ferro Logistics,ferrologistics.example,jo@ferrologistics.example",
  "Kestrel Health,,kai@gmail.com",
].join("\n");

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const v = (
  value: string | string[],
  sourceUrl: string | null = null,
  note: string | null = null,
): FieldResult => ({
  value,
  status: sourceUrl ? "verified" : "unverified",
  sourceUrl,
  note,
});
const est = (value: string, sourceUrl: string, note: string | null = null): FieldResult => ({
  value,
  status: "estimated",
  sourceUrl,
  note,
});
const na: FieldResult = { value: null, status: "unavailable", sourceUrl: null, note: null };

interface DemoCompany {
  name: string;
  fields: Record<string, FieldResult>;
  signals: { signal: string; date: string; sourceUrl: string | null }[];
  /** Canned page markdown for the evidence validator (by URL). Missing URL = page fails to load. */
  pages: Record<string, string>;
}

export function demoCompanies(): Record<string, DemoCompany> {
  return {
    "nimbusmetrics.example": {
      name: "Nimbus Metrics",
      fields: {
        description: v(
          "Observability platform for cloud-native engineering teams.",
          "https://nimbusmetrics.example/about",
        ),
        website: v("https://nimbusmetrics.example", "https://nimbusmetrics.example"),
        industry: v("SaaS (developer tools)", "https://nimbusmetrics.example/about"),
        headquarters: v("Austin, Texas, United States", "https://nimbusmetrics.example/about"),
        year_founded: v("2019", "https://nimbusmetrics.example/about"),
        ceo: v("Dana Whitfield", "https://nimbusmetrics.example/team"),
        employee_count: est("201-500", "https://directory.example.org/nimbus-metrics"),
        annual_revenue: est(
          "$30M",
          "https://directory.example.org/nimbus-metrics",
          "USD · as of 2025",
        ),
        total_funding: v("$58M", "https://news.example.org/nimbus-series-b", "USD"),
        funding_stage: v(
          `Series B (${daysAgo(12).slice(0, 7)})`,
          "https://news.example.org/nimbus-series-b",
        ),
        investors: v(
          ["Northwind Ventures", "Example Capital"],
          "https://news.example.org/nimbus-series-b",
        ),
        technology_stack: v(
          ["AWS", "Kubernetes", "Go", "React"],
          "https://nimbusmetrics.example/careers",
        ),
        hiring_activity: v(
          "14 open roles, mostly platform and SRE engineering",
          "https://nimbusmetrics.example/careers",
        ),
      },
      signals: [
        {
          signal: "Raised a $40M Series B led by Northwind Ventures",
          date: daysAgo(12),
          sourceUrl: "https://news.example.org/nimbus-series-b",
        },
        {
          signal: "Hiring 14 engineers for platform and SRE teams",
          date: daysAgo(20),
          sourceUrl: "https://nimbusmetrics.example/careers",
        },
        { signal: "Launched an AI incident assistant", date: daysAgo(75), sourceUrl: null },
      ],
      pages: {
        "https://news.example.org/nimbus-series-b":
          "# Nimbus Metrics raises $40M Series B\nAustin-based Nimbus Metrics has raised a $40M Series B led by Northwind Ventures to expand its observability platform.",
        "https://nimbusmetrics.example/careers":
          "# Careers at Nimbus Metrics\nWe are hiring 14 engineers across our platform and SRE teams. Open roles: Senior Platform Engineer, SRE, Kubernetes Engineer...",
        "https://search.example.org/nimbus-ai-assistant":
          "# Nimbus Metrics launches AI incident assistant\nNimbus Metrics today launched an AI assistant that summarises incidents for on-call engineers.",
      },
    },
    "harborledger.example": {
      name: "Harbor Ledger",
      fields: {
        description: v(
          "Accounting automation software for mid-market finance teams.",
          "https://harborledger.example",
        ),
        website: v("https://harborledger.example", "https://harborledger.example"),
        industry: v("SaaS (fintech)", "https://harborledger.example/about"),
        headquarters: v("New York, United States", "https://harborledger.example/contact"),
        year_founded: v("2016"),
        ceo: v("Morgan Ellis", "https://harborledger.example/team"),
        employee_count: est("501-1000", "https://directory.example.org/harbor-ledger"),
        annual_revenue: est(
          "$80M",
          "https://directory.example.org/harbor-ledger",
          "USD · as of 2025",
        ),
        total_funding: v("$140M", "https://news.example.org/harbor-series-c", "USD"),
        funding_stage: v("Series C (2024)", "https://news.example.org/harbor-series-c"),
        investors: v(["Example Growth Partners"]),
        technology_stack: v(["AWS", "Kubernetes", "Python"]),
        hiring_activity: v("A few open roles in sales", "https://harborledger.example/jobs"),
      },
      signals: [
        {
          signal: "Raised a $90M Series C",
          date: daysAgo(430),
          sourceUrl: "https://news.example.org/harbor-series-c",
        },
      ],
      pages: {},
    },
    "quillbyte.example": {
      name: "Quillbyte",
      fields: {
        description: v("AI writing assistant for support teams.", "https://quillbyte.example"),
        website: v("https://quillbyte.example", "https://quillbyte.example"),
        industry: v("SaaS (AI)", "https://quillbyte.example/about"),
        headquarters: v("Berlin, Germany", "https://quillbyte.example/imprint"),
        year_founded: v("2021"),
        ceo: v("Lena Hartmann", "https://quillbyte.example/about"),
        employee_count: est("51-200", "https://directory.example.org/quillbyte"),
        annual_revenue: na,
        total_funding: v("$12M", "https://news.example.org/quillbyte-seed", "USD"),
        funding_stage: v("Seed (2025)", "https://news.example.org/quillbyte-seed"),
        investors: na,
        technology_stack: v(["Google Cloud", "Python"]),
        hiring_activity: v("Hiring a US sales team", "https://quillbyte.example/jobs"),
      },
      signals: [
        {
          signal: "Launched Quillbyte Agents, an AI support product",
          date: daysAgo(25),
          sourceUrl: "https://quillbyte.example/blog/agents",
        },
        {
          signal: "Opening a New York office to enter the US market",
          date: daysAgo(40),
          sourceUrl: "https://news.example.org/quillbyte-us",
        },
      ],
      pages: {
        "https://quillbyte.example/blog/agents":
          "# Introducing Quillbyte Agents\nToday Quillbyte launched Agents, an AI support product that drafts replies for support teams.",
        "https://news.example.org/quillbyte-us":
          "# Quillbyte opens New York office\nBerlin startup Quillbyte is opening a New York office as it enters the US market.",
      },
    },
    "orbitly.example": {
      name: "Orbitly",
      fields: {
        description: v(
          "Scheduling software for field-service businesses.",
          "https://orbitly.example",
        ),
        website: v("https://orbitly.example", "https://orbitly.example"),
        industry: v("SaaS", "https://orbitly.example/about"),
        headquarters: v("Seattle, Washington, United States", "https://orbitly.example/about"),
        year_founded: v("2020"),
        ceo: na,
        employee_count: est("101-250", "https://directory.example.org/orbitly"),
        annual_revenue: na,
        total_funding: v("$18M", "https://news.example.org/orbitly-series-a", "USD"),
        funding_stage: v("Series A (2025)", "https://news.example.org/orbitly-series-a"),
        investors: na,
        technology_stack: v(["AWS", "Node.js"]),
        hiring_activity: v("Several engineering roles", "https://orbitly.example/careers"),
      },
      signals: [
        {
          signal: "Announced a partnership with a major cloud provider",
          date: daysAgo(35),
          sourceUrl: "https://orbitly.example/blog/partnership",
        },
        {
          signal: "Hiring backend engineers",
          date: daysAgo(150),
          sourceUrl: "https://orbitly.example/careers",
        },
      ],
      pages: {
        // The partnership page is intentionally missing: it "fails to load" in the demo.
        "https://orbitly.example/careers":
          "# Careers\nOrbitly is growing. Join our team in Seattle.",
      },
    },
    "kestrelhealth.example": {
      name: "Kestrel Health",
      fields: {
        description: v(
          "Patient intake software for outpatient clinics.",
          "https://kestrelhealth.example",
        ),
        website: v("https://kestrelhealth.example", "https://kestrelhealth.example"),
        industry: v("SaaS (healthtech)", "https://kestrelhealth.example/about"),
        headquarters: v(
          "Boston, Massachusetts, United States",
          "https://kestrelhealth.example/about",
        ),
        year_founded: v("2020"),
        ceo: v("Priya Raman", "https://kestrelhealth.example/team"),
        employee_count: est("120", "https://directory.example.org/kestrel-health"),
        annual_revenue: na,
        total_funding: v("$22M", "https://news.example.org/kestrel-series-a", "USD"),
        funding_stage: v("Series A (2025)", "https://news.example.org/kestrel-series-a"),
        investors: na,
        technology_stack: v(["Azure", ".NET"]),
        hiring_activity: v("A few open roles"),
      },
      signals: [{ signal: "Hiring customer success managers", date: daysAgo(50), sourceUrl: null }],
      pages: {},
    },
    "ferrologistics.example": {
      name: "Ferro Logistics",
      fields: {
        description: v(
          "Freight and warehousing services in Europe.",
          "https://ferrologistics.example",
        ),
        website: v("https://ferrologistics.example", "https://ferrologistics.example"),
        industry: v("Logistics", "https://ferrologistics.example/about"),
        headquarters: v("Rotterdam, Netherlands", "https://ferrologistics.example/contact"),
        year_founded: v("1998"),
        ceo: v("Pieter de Vries"),
        employee_count: est("2,000-5,000", "https://directory.example.org/ferro"),
        annual_revenue: est("$600M", "https://directory.example.org/ferro", "USD · as of 2024"),
        total_funding: na,
        funding_stage: v("Private"),
        investors: na,
        technology_stack: v(["SAP", "On-premise data centres"]),
        hiring_activity: v("Not hiring for technical roles"),
      },
      signals: [],
      pages: {},
    },
  };
}

/** Name-only demo rows (personal email, no domain) are identified by company name. */
export const DEMO_NAME_ONLY: Record<string, string> = { "kestrel health": "kestrelhealth.example" };
