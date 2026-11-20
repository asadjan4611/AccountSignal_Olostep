import { z } from "zod";
import type { CustomQuestion, FieldDef } from "../fields/catalog.js";
import type {
  BuyingSignal,
  CustomAnswer,
  FieldResult,
  FieldStatus,
} from "../providers/provider.js";

/**
 * Everything about the shape we ask Olostep for and how we validate what comes back.
 * Each field is an object so every value carries its basis and its own citation.
 */

export function buildJsonFormat(
  fields: readonly FieldDef[],
  includeBuyingSignals: boolean,
  questions: readonly CustomQuestion[],
): Record<string, unknown> {
  const format: Record<string, unknown> = { company_name: "", domain: "" };
  for (const field of fields) {
    if (field.kind === "list") format[field.key] = { value: [""], basis: "", source_url: "" };
    else if (field.kind === "money") {
      format[field.key] = { value: "", currency: "", basis: "", as_of: "", source_url: "" };
    } else format[field.key] = { value: "", basis: "", source_url: "" };
  }
  if (includeBuyingSignals) {
    format.buying_signals = [{ signal: "", date: "", source_url: "" }];
  }
  if (questions.length) {
    format.custom_answers = Object.fromEntries(
      questions.map((q) => [q.id, { answer: "", explanation: "", source_url: "" }]),
    );
  }
  return format;
}

export function buildTask(input: {
  companyName: string | null;
  domain: string | null;
  fields: readonly FieldDef[];
  includeBuyingSignals: boolean;
  questions: readonly CustomQuestion[];
}): string {
  const who = [
    input.companyName ? `Company: ${input.companyName}` : null,
    input.domain ? `Official or likely domain: ${input.domain}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const lines = input.fields.map((f, i) => `${i + 1}. ${f.key}: ${f.instruction}.`);
  const extra: string[] = [];
  if (input.includeBuyingSignals) {
    extra.push(
      "buying_signals: up to 6 public events from the last 12 months that suggest a good time to contact the company: new funding, hiring sprees, product launches, market expansion, leadership changes or partnerships. Give each its exact date (YYYY-MM-DD, or YYYY-MM if the day is unknown) and the source_url of the page that reports it.",
    );
  }
  for (const q of input.questions) {
    extra.push(
      `custom_answers.${q.id}: ${q.question} ${q.answerType === "yes_no" ? 'Answer "Yes", "No" or "NOT_FOUND".' : "Answer briefly."} Add a one-sentence explanation.`,
    );
  }
  return `Research this company using reliable, recent public sources.

${who}

Find:
${lines.join("\n")}${extra.length ? `\n\nAlso:\n${extra.map((e) => `- ${e}`).join("\n")}` : ""}

Rules:
- Make sure every fact is about this exact company (match the domain when given).
- Do not invent information. Use "NOT_FOUND" for any value you cannot verify.
- basis is "reported" when a source states the value, "estimated" for estimates (including third-party revenue or headcount estimates), or "NOT_FOUND".
- source_url is the single page that supports the value.
- For money values give a currency code and the year the figure applies to (as_of).`;
}

const NOT_FOUND = /^(not[\s_-]?found|n\/?a|unknown|none|null|undefined|-+|)$/i;
const isUrl = (v: unknown): v is string =>
  typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());
const clean = (v: unknown): string | null => {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return NOT_FOUND.test(t) ? null : t.slice(0, 1_000);
};

const FieldPayload = z
  .object({
    value: z.unknown().optional(),
    basis: z.unknown().optional(),
    currency: z.unknown().optional(),
    as_of: z.unknown().optional(),
    source_url: z.unknown().optional(),
  })
  .nullish()
  .catch(null);

function statusFor(hasValue: boolean, basis: string | null, sourceUrl: string | null): FieldStatus {
  if (!hasValue) return "unavailable";
  if (basis && /estimat/i.test(basis)) return "estimated";
  return sourceUrl ? "verified" : "unverified";
}

export function parseField(field: FieldDef, raw: unknown): FieldResult {
  // Olostep may return the bare value instead of the object we asked for; accept both.
  const payload =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? FieldPayload.parse(raw)
      : { value: raw };
  const sourceUrl = isUrl(payload?.source_url) ? payload.source_url.trim() : null;
  const basis = clean(payload?.basis);

  let value: string | string[] | null;
  if (field.kind === "list") {
    const items = Array.isArray(payload?.value)
      ? payload.value
      : typeof payload?.value === "string"
        ? payload.value.split(/[;\n]|,(?![^(]*\))/)
        : [];
    const list = [
      ...new Set(
        items
          .map((i) => clean(typeof i === "object" ? JSON.stringify(i) : i))
          .filter((i): i is string => !!i),
      ),
    ].slice(0, 20);
    value = list.length ? list : null;
  } else {
    value = clean(payload?.value);
  }

  let note: string | null = null;
  if (field.kind === "money" && value) {
    const parts = [
      clean(payload?.currency),
      clean(payload?.as_of) ? `as of ${clean(payload?.as_of)}` : null,
    ];
    note = parts.filter(Boolean).join(" · ") || null;
  }
  return { value, status: statusFor(value !== null, basis, sourceUrl), sourceUrl, note };
}

const SignalPayload = z
  .object({ signal: z.unknown(), date: z.unknown().optional(), source_url: z.unknown().optional() })
  .catch({ signal: null });

export function parseSignals(raw: unknown): BuyingSignal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => SignalPayload.parse(item))
    .flatMap((s) => {
      const signal = clean(s.signal);
      if (!signal) return [];
      return [
        {
          signal,
          date: clean(s.date),
          sourceUrl: isUrl(s.source_url) ? s.source_url.trim() : null,
        },
      ];
    })
    .slice(0, 8);
}

export function parseCustom(
  raw: unknown,
  questions: readonly CustomQuestion[],
): Record<string, CustomAnswer> {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    questions.map((q) => {
      const entry =
        obj[q.id] && typeof obj[q.id] === "object" ? (obj[q.id] as Record<string, unknown>) : {};
      let answer = clean(entry.answer);
      if (answer && q.answerType === "yes_no") {
        answer = /^y(es)?\b/i.test(answer) ? "Yes" : /^no?\b/i.test(answer) ? "No" : answer;
      }
      const sourceUrl = isUrl(entry.source_url) ? entry.source_url.trim() : null;
      return [
        q.id,
        {
          question: q.question,
          answer,
          explanation: clean(entry.explanation),
          sourceUrl,
          status: statusFor(answer !== null, null, sourceUrl),
        },
      ];
    }),
  );
}
