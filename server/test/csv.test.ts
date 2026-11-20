import { describe, expect, it } from "vitest";
import { detectMapping, parseCsv, summarize, validateRows } from "../src/services/csv.service.js";
import {
  emailDomain,
  normalizeCompanyName,
  websiteDomain,
} from "../src/services/domain.service.js";

describe("domain.service", () => {
  it("extracts registrable domains", () => {
    expect(emailDomain("john@mail.acme.co.uk")).toBe("acme.co.uk");
    expect(emailDomain("not-an-email")).toBeNull();
    expect(websiteDomain("https://www.stripe.com/pricing")).toBe("stripe.com");
    expect(websiteDomain("localhost:3000")).toBeNull();
    expect(websiteDomain("10.0.0.1")).toBeNull();
  });

  it("normalizes company names so variants group together", () => {
    expect(normalizeCompanyName("Acme Technologies, Inc.")).toBe("acme technologies");
    expect(normalizeCompanyName("ACME Technologies LLC")).toBe("acme technologies");
  });
});

describe("csv.service", () => {
  it("detects flexible column names", () => {
    expect(detectMapping(["Email Address", "Contact Name", "Organization"])).toEqual({
      email: "Email Address",
      contact_name: "Contact Name",
      company_name: "Organization",
      website: null,
    });
    expect(detectMapping(["work_email", "full_name", "company_name", "Company Website"])).toEqual({
      email: "work_email",
      contact_name: "full_name",
      company_name: "company_name",
      website: "Company Website",
    });
    // "Company Email" must not be mistaken for the company name.
    expect(detectMapping(["Company Email", "Name", "Company"]).company_name).toBe("Company");
  });

  it("rejects files without headers or over the row limit", () => {
    expect(() => parseCsv("", 10)).toThrow(/header/);
    expect(() => parseCsv("email\na@b.com\nc@d.com", 1)).toThrow(/limit/);
  });

  it("validates rows, groups companies and flags problems instead of dropping them", () => {
    const csv = parseCsv(
      [
        "\uFEFFWork Email,Contact Name,Company Name",
        "john@acme.com,John Smith,Acme",
        "sarah@acme.com,Sarah Williams,Acme",
        "JOHN@acme.com,John Again,Acme",
        "omar@gmail.com,Omar Khan,Notion",
        "bad-email,Chris Wong,Figma",
        "ann@yahoo.com,Ann,",
      ].join("\n"),
      100,
    );
    const mapping = detectMapping(csv.columns);
    const rows = validateRows(csv, mapping);

    expect(rows.map((r) => r.groupKey)).toEqual([
      "domain:acme.com",
      "domain:acme.com",
      "domain:acme.com",
      "name:notion",
      "name:figma",
      null,
    ]);
    expect(rows[2]?.issues).toContain("duplicate");
    expect(rows[3]?.issues).toContain("personal_email");
    expect(rows[3]?.identification).toBe("company_name");
    expect(rows[4]?.issues).toContain("invalid_email");
    expect(rows[5]?.issues).toEqual(
      expect.arrayContaining(["personal_email", "missing_company", "unidentified"]),
    );

    expect(summarize(rows)).toEqual({
      total_rows: 6,
      valid_emails: 3,
      invalid_emails: 1,
      personal_emails: 2,
      missing_emails: 0,
      duplicates: 1,
      companies: 3,
      unidentified: 1,
    });
  });
});
