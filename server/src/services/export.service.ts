import Papa from "papaparse";
import { RESEARCH_FIELDS } from "../fields/catalog.js";
import type { FieldResult } from "../providers/provider.js";
import type { Store } from "../store/store.js";
import type { EnrichmentJob } from "../store/types.js";
import { ISSUE_TEXT } from "./csv.service.js";

/** Stop spreadsheets from executing cell values as formulas (CSV injection). */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function fieldText(f: FieldResult | undefined): string {
  if (!f || f.value === null) return "NOT_FOUND";
  const value = Array.isArray(f.value) ? f.value.join("; ") : f.value;
  return f.note ? `${value} (${f.note})` : value;
}

/** One row per original CSV row, with the account's scores, brief and research appended. */
export function exportCsv(job: EnrichmentJob, store: Store): string {
  const leads = store.getLeads(job.id);
  const taskByLead = new Map(job.tasks.flatMap((t) => t.leadIds.map((id) => [id, t] as const)));
  const header = [
    ...job.columns,
    "Priority",
    "ICP fit",
    "Timing",
    "Summary",
    "Why now (signals)",
    "Investigate next",
    "Gaps",
    ...RESEARCH_FIELDS.flatMap((f) => [f.label, `${f.label} status`, `${f.label} source`]),
    "Research sources",
    "Status",
    "Warnings",
  ];
  const data = leads.map((lead) => {
    const task = taskByLead.get(lead.id);
    const company = lead.companyId ? store.getCompany(lead.companyId) : undefined;
    const signals = (task?.signals ?? [])
      .filter((s) => s.points > 0)
      .sort((a, b) => b.points - a.points)
      .map(
        (s) =>
          `${s.signal} (${s.date ?? "undated"}, ${s.evidence}${s.checkedUrl ? `, ${s.checkedUrl}` : ""})`,
      );
    return [
      ...job.columns.map((c) => lead.data[c] ?? ""),
      task?.priority ?? "",
      task?.fit ? String(task.fit.score) : "",
      task?.timing ? String(task.timing.score) : "",
      task?.brief?.summary ?? "",
      signals.join(" | "),
      task?.brief?.next.join(" | ") ?? "",
      task?.brief?.gaps.join(" | ") ?? "",
      ...RESEARCH_FIELDS.flatMap((f) => {
        const r = company?.fields[f.key];
        return company
          ? [fieldText(r), r?.status ?? "unavailable", r?.sourceUrl ?? ""]
          : ["", "", ""];
      }),
      company?.sources.join(" ") ?? "",
      lead.message ? `${lead.status}: ${lead.message}` : lead.status,
      lead.issues.map((i) => ISSUE_TEXT[i]).join("; "),
    ];
  });
  return Papa.unparse({ fields: header.map(safeCell), data: data.map((r) => r.map(safeCell)) });
}

export function exportJson(job: EnrichmentJob, store: Store) {
  return {
    run: {
      id: job.id,
      filename: job.filename,
      status: job.status,
      demo: job.demo,
      created_at: job.createdAt,
      icp: job.icp,
    },
    accounts: job.tasks.map((t) => {
      const company = t.companyId ? store.getCompany(t.companyId) : undefined;
      return {
        company_name: company?.companyName ?? t.companyName,
        domain: company?.domain ?? t.domain,
        status: t.status,
        priority: t.priority,
        fit: t.fit,
        timing: t.timing,
        brief: t.brief,
        signals: t.signals,
        fields: company?.fields ?? null,
        sources: company?.sources ?? [],
        contacts: store
          .getLeads(job.id)
          .filter((l) => t.leadIds.includes(l.id))
          .map((l) => ({ ...l.data, _warnings: l.issues.map((i) => ISSUE_TEXT[i]) })),
      };
    }),
  };
}
