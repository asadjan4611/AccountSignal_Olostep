// The core of AccountSignal in one file: research one company with the Olostep Answers API
// and get structured, sourced JSON back. No dependencies (Node 20+ has fetch).
//
//   node --env-file=.env examples/research-one-company.mjs stripe.com "Stripe"
//
// Costs 20 Olostep credits.

const [domain = "stripe.com", name = ""] = process.argv.slice(2);
const apiKey = process.env.OLOSTEP_API_KEY;
if (!apiKey) {
  console.error("Set OLOSTEP_API_KEY (e.g. in .env) first.");
  process.exit(1);
}

const field = { value: "", basis: "", source_url: "" };

const res = await fetch("https://api.olostep.com/v1/answers", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    task: [
      `Research the company ${name || domain} (domain: ${domain}) using reliable, recent public sources.`,
      "Find its industry, headquarters, employee count, funding stage, total funding and tech stack,",
      "plus up to 5 buying signals from the last 12 months (funding, hiring, launches, expansion,",
      "leadership changes) with an exact date (YYYY-MM-DD) and the source_url that reports each one.",
      'Do not invent anything: use "NOT_FOUND" when a value cannot be verified.',
      'basis is "reported" or "estimated".',
    ].join(" "),
    // An object with empty values describes the JSON shape we want back.
    json_format: {
      company_name: "",
      industry: field,
      headquarters: field,
      employee_count: field,
      funding_stage: field,
      total_funding: field,
      technology_stack: { value: [""], basis: "", source_url: "" },
      buying_signals: [{ signal: "", date: "", source_url: "" }],
    },
  }),
});

if (!res.ok) {
  console.error(`Olostep returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const answer = await res.json();
// json_content is a JSON *string*: parse it before use.
const company = JSON.parse(answer.result.json_content);

console.log(JSON.stringify(company, null, 2));
console.log("\nSources:", answer.result.sources);
