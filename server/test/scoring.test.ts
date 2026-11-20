import { describe, expect, it } from "vitest";
import { buildBrief } from "../src/services/brief.service.js";
import {
  classifySignal,
  parseHeadcount,
  parseMoney,
  priorityOf,
  scoreIcp,
  scoreTiming,
  signalPoints,
} from "../src/services/scoring.service.js";
import type { FieldResult } from "../src/providers/provider.js";
import type { IcpCriteria, Signal } from "../src/store/types.js";

const f = (value: string | string[] | null): FieldResult => ({
  value,
  status: value ? "verified" : "unavailable",
  sourceUrl: null,
  note: null,
});

const icp: IcpCriteria = {
  industries: ["SaaS"],
  locations: ["USA", "United States"],
  minEmployees: 100,
  maxEmployees: 2000,
  technologies: ["AWS", "Kubernetes"],
  fundingStages: ["Series A", "Series B"],
  minFundingUsd: null,
  mustBeHiring: false,
};

const signal = (over: Partial<Signal>): Signal => {
  const s = {
    signal: "Raised a Series B",
    type: "funding" as const,
    date: null,
    ageDays: 10,
    sourceUrl: null,
    checkedUrl: null,
    evidence: "verified" as const,
    evidenceNote: "",
    ...over,
  };
  return { ...s, points: signalPoints(s) };
};

describe("parsers", () => {
  it("reads money and headcount the way companies write them", () => {
    expect(parseMoney("$25M")).toBe(25_000_000);
    expect(parseMoney("USD 1.2 billion (2024)")).toBe(1_200_000_000);
    expect(parseMoney("Series B")).toBeNull();
    expect(parseHeadcount("201-500")).toEqual([201, 500]);
    expect(parseHeadcount("8,000+")).toEqual([8000, Infinity]);
    expect(parseHeadcount("about 250 employees (2025)")).toEqual([250, 250]);
  });

  it("classifies signals by type", () => {
    expect(classifySignal("Raised a $40M Series B")).toBe("funding");
    expect(classifySignal("Hiring 14 engineers")).toBe("hiring");
    expect(classifySignal("Launched an AI assistant")).toBe("launch");
    expect(classifySignal("Opening a New York office")).toBe("expansion");
    expect(classifySignal("Appoints a new CFO")).toBe("leadership");
    expect(classifySignal("Announced a partnership with AWS")).toBe("partnership");
    expect(classifySignal("Won an industry award")).toBe("other");
  });
});

describe("ICP fit", () => {
  it("records matched, missed and unknown checks with the value they were judged on", () => {
    const fit = scoreIcp(icp, {
      fields: {
        industry: f("SaaS"),
        headquarters: f("Austin, Texas, United States"),
        employee_count: f("201-500"),
        technology_stack: f(["AWS", "Go"]),
        funding_stage: f(null),
      },
    });
    expect(fit.checks.map((c) => c.outcome)).toEqual([
      "matched",
      "matched",
      "matched",
      "matched",
      "unknown",
    ]);
    expect(fit).toMatchObject({ score: 80, level: "High Fit" });
    expect(fit.checks[3]?.value).toBe("AWS, Go");
  });
});

describe("timing", () => {
  it("weights type, recency and evidence; old signals score zero", () => {
    expect(signalPoints({ type: "funding", ageDays: 10, evidence: "verified" })).toBe(30);
    expect(signalPoints({ type: "funding", ageDays: 60, evidence: "verified" })).toBe(21);
    expect(signalPoints({ type: "hiring", ageDays: 10, evidence: "unverified" })).toBe(10);
    expect(signalPoints({ type: "funding", ageDays: 400, evidence: "verified" })).toBe(0);
    expect(signalPoints({ type: "funding", ageDays: null, evidence: "verified" })).toBe(6);
  });

  it("counts the strongest signal per type and caps at 100", () => {
    const timing = scoreTiming([
      signal({ type: "funding", ageDays: 5 }),
      signal({ type: "hiring", ageDays: 5 }),
      signal({ type: "hiring", ageDays: 100 }),
    ]);
    expect(timing.breakdown).toEqual([
      { type: "funding", points: 30 },
      { type: "hiring", points: 25 },
    ]);
    expect(timing.score).toBe(92);
    expect(scoreTiming([]).score).toBe(0);
  });

  it("combines fit and timing into a priority", () => {
    expect(priorityOf(80, 70)).toBe("Act now");
    expect(priorityOf(80, 10)).toBe("Nurture");
    expect(priorityOf(20, 70)).toBe("Watch");
    expect(priorityOf(20, 10)).toBe("Skip");
  });
});

describe("account brief", () => {
  it("is built only from evidence and suggests concrete next steps", () => {
    const fit = scoreIcp(icp, {
      fields: {
        industry: f("SaaS"),
        headquarters: f("Berlin, Germany"),
        employee_count: f(null),
        technology_stack: f(["AWS"]),
        funding_stage: f("Series B (2026)"),
      },
    });
    const signals = [
      signal({ signal: "Hiring 14 engineers", type: "hiring", date: "2026-11-01", ageDays: 10 }),
      signal({
        signal: "Opening a US office",
        type: "expansion",
        ageDays: 40,
        evidence: "partial",
        evidenceNote: "Source only partly supports the claim",
      }),
    ];
    const timing = scoreTiming(signals);
    const brief = buildBrief({
      companyName: "Acme",
      fit,
      timing,
      priority: priorityOf(fit.score, timing.score),
      signals,
    });
    expect(brief.whyFit).toContain("Industry: SaaS · SaaS");
    expect(brief.gaps).toEqual(
      expect.arrayContaining([
        'Location: USA / United States · found "Berlin, Germany"',
        "Employees: 100–2,000 · unknown",
      ]),
    );
    expect(brief.whyNow[0]).toBe("Hiring 14 engineers (2026-11-01): verified");
    expect(brief.next).toEqual(
      expect.arrayContaining([
        "Look at their open roles to find the team that would use your product.",
        "Confirm employees: 100–2,000: no reliable data was found.",
        'Double-check "Opening a US office": source only partly supports the claim.',
      ]),
    );
  });
});
