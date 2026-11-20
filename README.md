<<<<<<< HEAD
# AccountSignal

**Know which accounts to contact first, and why now.**

Upload a list of companies. AccountSignal researches each one with live web data from
[Olostep](https://www.olostep.com), checks every buying signal against its source, and ranks the
accounts by **ICP fit** and **timing**. Each account gets a short brief built only from cited
evidence.

> Olostep does the research. Your app makes the GTM decision.

<!-- Add a demo GIF here: docs/demo.gif -->

## Try it in 2 minutes (no API key needed)

```bash
git clone https://github.com/asadjan4611/accountsignal.git
cd accountsignal
cp .env.example .env
```

With **npm**:

```bash
npm ci
npm run dev
```

Or with **pnpm**:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:5173 and click **Try the demo**. It runs six **fictional** companies
(clearly labelled as demo data) through the real pipeline (evidence checks, scoring and briefs)
with no key and no credits.

To analyse real companies, add your `OLOSTEP_API_KEY` to `.env`, restart, and click **Check my API
key** to see your credit balance for free. The bundled `sample-data/accounts.csv` (5 companies)
costs about 100–165 credits.

There's no database, no Docker and no other API keys.

## How it works

```text
1. Define your ICP        industry, location, employees, technologies, funding stage, hiring
2. Upload accounts        company_name, domain (contact_email optional) → validated, duplicates grouped
3. Research (Olostep)     Answers: profile, size, funding, tech stack + dated buying signals
4. Check evidence         Scrape opens each signal's source page; Search finds one if missing
5. Score                  ICP fit (0-100) × Timing (0-100) → Act now · Nurture · Watch · Skip
6. Brief                  why it fits, why now, gaps, what to check next (cited facts only)
7. Export                 CSV / JSON with scores, signals, evidence and sources
```

| Olostep endpoint         | What AccountSignal uses it for                                                                    | Credits                          |
| ------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| `POST /v1/answers`       | Research each company once: structured JSON with a basis and source per field, plus dated signals | 20 per company                   |
| `POST /v1/scrapes`       | Open a signal's source page and check it supports the claim                                       | 1 per page (max 3 per company)   |
| `POST /v1/searches`      | Find a source when the research gave a signal without one                                         | 5 per search (max 2 per company) |
| `GET /user/credits/info` | "Check my API key": validity and balance                                                          | free                             |

Research is reused for `CACHE_DAYS` (7), so re-running the same companies only re-checks the
evidence. That matters because timing depends on today's date.

## The scoring engine (plain rules, no AI)

**ICP fit:** each criterion you set is **matched**, **missed** or **unknown** (no reliable data).
Fit = share of criteria matched. Unknown never counts as a match.

**Timing:** for every signal:

```text
points = type weight × recency × evidence
type:     funding 30 · hiring 25 · launch 20 · expansion 20 · leadership 15 · partnership 15 · other 10
recency:  ≤30 days 1.0 · ≤90 0.7 · ≤180 0.4 · ≤365 0.2 · older 0 · undated 0.2
evidence: verified 1.0 · partly supported 0.7 · unverified 0.4
```

The strongest signal of each type counts, so ten job posts don't outweigh real variety.
60 points = a timing score of 100 (for example, a fresh verified funding round plus fresh hiring).

**Priority:**

|              | Timing ≥ 50 | Timing < 50 |
| ------------ | ----------- | ----------- |
| **Fit ≥ 60** | **Act now** | Nurture     |
| **Fit < 60** | Watch       | Skip        |

**Evidence check:** a signal is **verified** when its source page loads, names the company, and
contains most of the claim's key words and figures. It's **partly supported** when only some of
that holds, and **unverified** when there's no source, the page doesn't load, or it doesn't support
the claim. Buying signals suggest an opportunity; they are never treated as proof of purchase
intent.

## Use it in your own code

The whole Olostep call fits in one file: [`examples/research-one-company.mjs`](examples/research-one-company.mjs)

```bash
node --env-file=.env examples/research-one-company.mjs stripe.com "Stripe"
```

Inside the app, research goes through one interface, so the business logic never depends on
Olostep's API shape:

```ts
interface CompanyEnrichmentProvider {
  enrichCompany(input: {
    companyName;
    domain;
    fields;
    includeBuyingSignals;
  }): Promise<EnrichmentResult>;
}
```

`OlostepEnrichmentProvider` implements it with Answers. `DemoProvider` implements it with the
bundled demo data. Evidence checks use a small `WebClient` interface (`scrape`, `search`) that
`OlostepClient` implements.

## Architecture

```text
React + TypeScript (Vite)  ──HTTP──▶  Express + TypeScript
                                         │
            csv · domain · scoring · evidence · brief · export services
                                         │
                       EnrichmentQueue (in-process, low concurrency)
                                         │
                EnrichmentWorker: research → evidence → score → brief
                     │                     │
         OlostepEnrichmentProvider    OlostepClient (Search + Scrape)
                                         │
                         Store (memory + JSON file, no database)
```

- **No database, Docker or Redis.** Runs, your ICP and cached research live in memory and are saved
  atomically to `DATA_FILE` (`.data/accountsignal.json`), so they survive restarts. Unfinished
  runs resume on start.
- **Privacy.** Only company names and domains are sent to Olostep. Contact emails stay on your
  server, and runs are deleted after `RETENTION_DAYS` (30).
- **Reliability.** Retries with backoff on 429/5xx/timeouts. A bad key or empty balance stops the
  run immediately. Runs can be retried and cancelled. The API key never reaches the browser.

```text
server/src/
  providers/        CompanyEnrichmentProvider, Olostep + demo implementations
  services/         olostep (HTTP client), csv, domain, scoring, evidence, brief, export, enrichment
  workers/          research → evidence → score → brief, per company
  queues/           background queue (concurrency, cancel, resume)
  store/            memory + JSON snapshot
  demo/             fictional demo dataset
client/src/pages/   Dashboard, IcpPage, Upload, Preview, Review, RunPage, AccountPage
examples/           research-one-company.mjs
sample-data/        accounts.csv
```

## API

| Method        | Endpoint                                | Purpose                                                             |
| ------------- | --------------------------------------- | ------------------------------------------------------------------- |
| `GET`         | `/api/connection`                       | Is the Olostep key valid, and how many credits are left (free)      |
| `GET` / `PUT` | `/api/icp`                              | Read / save the ideal customer profile                              |
| `POST`        | `/api/csv/preview`                      | Upload a CSV (multipart `file`): mapping, validation, preview       |
| `POST`        | `/api/csv/:uploadId/validate`           | Re-validate with a manual `column_mapping`                          |
| `POST`        | `/api/runs/estimate`                    | Credit and USD range before anything is spent                       |
| `POST`        | `/api/runs`                             | Start a run → `{ run_id }`                                          |
| `POST`        | `/api/demo`                             | Start the demo run (no key, no credits)                             |
| `GET`         | `/api/runs`                             | History and dashboard totals                                        |
| `GET`         | `/api/runs/:id`                         | Status, live progress, priority counts                              |
| `GET`         | `/api/runs/:id/accounts`                | Accounts ranked by priority, plus the original rows                 |
| `GET`         | `/api/runs/:id/accounts/:companyId`     | Full brief: scores, checks, signals with evidence, profile, sources |
| `GET`         | `/api/runs/:id/export?format=csv\|json` | Export                                                              |
| `POST`        | `/api/runs/:id/retry` · `/cancel`       | Retry failed companies · cancel                                     |
| `DELETE`      | `/api/runs/:id`                         | Delete a run and its contact data                                   |

## Configuration

See [`.env.example`](.env.example). Everything has a sensible default. The main settings:

| Variable                                        | Default                    |                                                       |
| ----------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| `OLOSTEP_API_KEY`                               | —                          | Empty = demo mode only                                |
| `PORT`                                          | `5000`                     | API port (the Vite dev server on 5173 proxies `/api`) |
| `ENRICH_CONCURRENCY`                            | `3`                        | Companies analysed at once                            |
| `EVIDENCE_MAX_CHECKS` / `EVIDENCE_MAX_SEARCHES` | `3` / `2`                  | Evidence budget per company                           |
| `CACHE_DAYS`                                    | `7`                        | Reuse company research instead of paying again        |
| `DATA_FILE`                                     | `.data/accountsignal.json` | Empty = memory only                                   |
| `OLOSTEP_USD_PER_CREDIT`                        | `0.000495`                 | For cost estimates; set it to match your plan         |

## Development

| npm                                  | pnpm                           |                                                                  |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------------------- |
| `npm run dev`                        | `pnpm dev`                     | API :5000 + UI :5173                                             |
| `npm test`                           | `pnpm test`                    | Unit + end-to-end tests (fakes and demo data, no key or credits) |
| `npm run lint` · `npm run typecheck` | `pnpm lint` · `pnpm typecheck` |                                                                  |
| `npm run build` · `npm start`        | `pnpm build` · `pnpm start`    | Production: API + UI on :5000                                    |

Both `package-lock.json` and `pnpm-lock.yaml` are committed, and CI checks both. Use one package
manager per checkout: delete `node_modules` before switching.

## License

MIT
=======
# AccountSignal_Olostep
>>>>>>> b359a6bd7a8cc8c55b4f7c3e39a056b2a21fec60
