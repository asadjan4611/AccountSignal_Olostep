/**
 * The research fields a user can pick. Each one becomes a key in the Olostep Answers
 * `json_format`, so adding a field here is all it takes to research something new.
 */
export type FieldKind = "text" | "list" | "money";

export const FIELD_GROUPS = [
  { id: "company_profile", label: "Company profile" },
  { id: "leadership", label: "Leadership" },
  { id: "financial", label: "Financial information" },
  { id: "company_size", label: "Company size" },
  { id: "business_intelligence", label: "Business intelligence" },
] as const;

export type FieldGroupId = (typeof FIELD_GROUPS)[number]["id"];

export interface FieldDef {
  key: string;
  label: string;
  group: FieldGroupId;
  kind: FieldKind;
  /** What Olostep should find, written as an instruction. */
  instruction: string;
}

export const FIELDS: readonly FieldDef[] = [
  {
    key: "description",
    label: "Company description",
    group: "company_profile",
    kind: "text",
    instruction: "One-sentence description of what the company does and for whom",
  },
  {
    key: "website",
    label: "Website",
    group: "company_profile",
    kind: "text",
    instruction: "Official website URL",
  },
  {
    key: "industry",
    label: "Industry",
    group: "company_profile",
    kind: "text",
    instruction: "Primary industry, e.g. SaaS, Fintech, Developer tools",
  },
  {
    key: "headquarters",
    label: "Headquarters",
    group: "company_profile",
    kind: "text",
    instruction: "Headquarters city and country",
  },
  {
    key: "year_founded",
    label: "Year founded",
    group: "company_profile",
    kind: "text",
    instruction: "Year the company was founded",
  },
  {
    key: "founders",
    label: "Founder names",
    group: "leadership",
    kind: "list",
    instruction: "Founders, each as 'Name (Role)'",
  },
  {
    key: "ceo",
    label: "CEO",
    group: "leadership",
    kind: "text",
    instruction: "Current CEO's name",
  },
  {
    key: "leadership",
    label: "Leadership team",
    group: "leadership",
    kind: "list",
    instruction: "Key executives, each as 'Name (Title)'",
  },
  {
    key: "annual_revenue",
    label: "Annual revenue",
    group: "financial",
    kind: "money",
    instruction:
      "Most recent annual revenue; say whether it is reported by the company or a third-party estimate",
  },
  {
    key: "total_funding",
    label: "Total funding",
    group: "financial",
    kind: "money",
    instruction: "Total funding raised to date",
  },
  {
    key: "funding_stage",
    label: "Funding stage",
    group: "financial",
    kind: "text",
    instruction:
      "Latest funding round or stage with its date, e.g. 'Series B (2025)', or 'Public' / 'Bootstrapped'",
  },
  {
    key: "investors",
    label: "Investors",
    group: "financial",
    kind: "list",
    instruction: "Notable or lead investors",
  },
  {
    key: "employee_count",
    label: "Employee count",
    group: "company_size",
    kind: "text",
    instruction: "Current number of employees or a range such as '201-500'",
  },
  {
    key: "technology_stack",
    label: "Technology stack",
    group: "business_intelligence",
    kind: "list",
    instruction: "Technologies the company publicly uses",
  },
  {
    key: "recent_news",
    label: "Recent news",
    group: "business_intelligence",
    kind: "list",
    instruction: "Notable news from the last 12 months, each with its date",
  },
  {
    key: "hiring_activity",
    label: "Hiring activity",
    group: "business_intelligence",
    kind: "text",
    instruction: "Current hiring: roughly how many open roles and which teams, or 'Not hiring'",
  },
];

export const FIELD_KEYS = FIELDS.map((f) => f.key);

export function fieldsFor(keys: readonly string[]): FieldDef[] {
  const wanted = new Set(keys);
  return FIELDS.filter((f) => wanted.has(f.key));
}

export interface CustomQuestion {
  /** Stable key used in the JSON schema, e.g. "q1". */
  id: string;
  question: string;
  answerType: "yes_no" | "text";
}

/** The fixed research profile: everything the ICP and the account brief need. */
export const RESEARCH_FIELD_KEYS = [
  "description",
  "website",
  "industry",
  "headquarters",
  "year_founded",
  "ceo",
  "employee_count",
  "annual_revenue",
  "total_funding",
  "funding_stage",
  "investors",
  "technology_stack",
  "hiring_activity",
] as const;

export const RESEARCH_FIELDS = fieldsFor(RESEARCH_FIELD_KEYS);
