import { describe, expect, it } from "vitest";
import { formatUsd, formatValue, hostOf } from "./format";

describe("format", () => {
  it("formats values, money and hosts for display", () => {
    expect(formatValue(["Node.js", "AWS"])).toBe("Node.js, AWS");
    expect(formatValue(null)).toBe("");
    expect(formatUsd(0.0099)).toBe("$0.0099");
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(hostOf("https://www.acme.com/about")).toBe("acme.com");
  });
});
