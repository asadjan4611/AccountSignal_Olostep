import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconFile,
  IconTable,
  IconUpload,
} from "../components/common/icons";
import { Page } from "../components/common/Layout";
import { Steps } from "../components/common/Steps";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  CardHeader,
  EmptyState,
  SelectInput,
  Spinner,
  Stat,
} from "../components/common/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import type { ColumnMapping, Preview as PreviewData } from "../lib/types";
import { api, draftStore, errorMessage } from "../services/api";

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; hint: string }[] = [
  {
    key: "company_name",
    label: "Company name",
    hint: "Used for research, and when there's no domain",
  },
  {
    key: "website",
    label: "Domain / website",
    hint: "The most reliable way to identify a company",
  },
  { key: "email", label: "Contact email (optional)", hint: "Gives the domain when it's missing" },
  {
    key: "contact_name",
    label: "Contact name (optional)",
    hint: "Kept with the row, never sent to Olostep",
  },
];

const IDENTIFIED: Record<string, { label: string; tone: "good" | "brand" | "warn" | "bad" }> = {
  email_domain: { label: "Email domain", tone: "good" },
  website: { label: "Website", tone: "good" },
  company_name: { label: "Company name", tone: "brand" },
  unidentified: { label: "Needs a company", tone: "bad" },
};

export function Preview() {
  const { uploadId = "" } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<PreviewData | null>(() => draftStore.load(uploadId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle("Preview");

  if (!preview) {
    return (
      <Page eyebrow="New analysis" title="Upload expired">
        <EmptyState
          icon={<IconUpload className="size-5" />}
          title="This upload is no longer available"
          action={
            <Link to="/new" className={buttonClass("primary")}>
              Upload the file again
            </Link>
          }
        >
          Uploads are kept for an hour, in this browser tab only.
        </EmptyState>
      </Page>
    );
  }

  async function remap(key: keyof ColumnMapping, column: string) {
    if (!preview) return;
    const mapping = { ...preview.column_mapping, [key]: column || null };
    setBusy(true);
    setError(null);
    try {
      const next = await api.validateMapping(preview.upload_id, mapping);
      setPreview(next);
      draftStore.save(next);
    } catch (err) {
      setError(errorMessage(err, "Could not validate that mapping."));
    } finally {
      setBusy(false);
    }
  }

  const s = preview.summary;
  const stats = [
    { label: "Total rows", value: s.total_rows },
    { label: "Identifiable rows", value: s.total_rows - s.unidentified, tone: "text-good" },
    { label: "Invalid emails", value: s.invalid_emails, tone: s.invalid_emails ? "text-bad" : "" },
    {
      label: "Personal emails",
      value: s.personal_emails,
      tone: s.personal_emails ? "text-warn" : "",
    },
    { label: "Duplicates", value: s.duplicates, tone: s.duplicates ? "text-warn" : "" },
    { label: "Companies to research", value: s.companies, tone: "text-brand" },
  ];
  const companyMapped = Boolean(
    preview.column_mapping.company_name || preview.column_mapping.website,
  );
  const canContinue = s.companies > 0 && !busy;

  return (
    <Page
      eyebrow="New analysis"
      title="Preview and validate"
      sub={<Steps current={2} links={{ 0: "/icp?next=upload", 1: "/new" }} />}
      actions={
        <>
          <Link to="/new" className={buttonClass("secondary")}>
            <IconArrowLeft className="size-4" />
            Different file
          </Link>
          <Button
            variant="primary"
            disabled={!canContinue}
            onClick={() => navigate(`/new/${preview.upload_id}/review`)}
          >
            Continue
            <IconArrowRight className="size-4" />
          </Button>
        </>
      }
    >
      <p className="mb-4 flex items-center gap-2 text-sm text-muted">
        <IconFile className="size-4 text-brand" />
        <span className="text-ink">{preview.filename}</span> · {preview.columns.length} columns
      </p>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((st) => (
          <Stat key={st.label} label={st.label} value={st.value} tone={st.tone || "text-ink"} />
        ))}
      </dl>

      {s.companies === 0 && (
        <div className="mt-4">
          <Alert tone="bad" title="No companies to research">
            {companyMapped
              ? "None of the rows has a usable domain, work email or company name."
              : "Map a company name or domain column below to continue."}
          </Alert>
        </div>
      )}

      {(s.personal_emails > 0 || s.unidentified > 0) && (
        <div className="mt-4">
          <Alert tone="warn">
            {s.personal_emails > 0 &&
              `${s.personal_emails === 1 ? "1 personal email (Gmail, Yahoo…) doesn't" : `${s.personal_emails} personal emails (Gmail, Yahoo…) don't`} reveal an employer, so those companies are identified by company name instead. `}
            {s.unidentified > 0 &&
              `${s.unidentified} row${s.unidentified > 1 ? "s have" : " has"} no domain, work email or company name and will be skipped. `}
            AccountSignal researches companies, not people.
          </Alert>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader
          icon={<IconTable className="size-4" />}
          title="Column mapping"
          sub="Detected automatically. Change any column that's wrong."
          action={
            busy ? (
              <Spinner className="size-4 text-brand" />
            ) : (
              <Badge tone="good">
                <IconCheck className="size-3" /> Validated
              </Badge>
            )
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {MAPPING_FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="text-ink">{f.label}</span>
              <SelectInput
                value={preview.column_mapping[f.key] ?? ""}
                disabled={busy}
                onChange={(e) => void remap(f.key, e.target.value)}
                className="mt-1.5 block"
              >
                <option value="">Not in this file</option>
                {preview.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectInput>
              <span className="mt-1 block text-xs text-muted">{f.hint}</span>
            </label>
          ))}
        </div>
        {error && (
          <div className="px-5 pb-5">
            <Alert tone="bad">{error}</Alert>
          </div>
        )}
      </Card>

      <div
        className={`mt-6 overflow-x-auto rounded-xl border border-line bg-white shadow-(--shadow-card) transition ${busy ? "opacity-60" : ""}`}
      >
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-bg-soft text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-normal">#</th>
              <th className="px-4 py-2.5 font-normal">Email</th>
              <th className="px-4 py-2.5 font-normal">Contact name</th>
              <th className="px-4 py-2.5 font-normal">Company</th>
              <th className="px-4 py-2.5 font-normal">Identified by</th>
              <th className="px-4 py-2.5 font-normal">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const id = IDENTIFIED[row.identification] ?? IDENTIFIED.unidentified!;
              return (
                <tr
                  key={row.row_index}
                  className={`border-t border-line align-top hover:bg-bg-soft ${row.identification === "unidentified" ? "bg-bad-soft/40" : ""}`}
                >
                  <td className="px-4 py-2.5 text-muted tabular-nums">{row.row_index + 1}</td>
                  <td className="max-w-56 truncate px-4 py-2.5 text-ink">
                    {row.email || <span className="text-faint">—</span>}
                  </td>
                  <td className="max-w-48 truncate px-4 py-2.5 text-ink-2">
                    {row.contact_name || <span className="text-faint">—</span>}
                  </td>
                  <td className="max-w-48 truncate px-4 py-2.5 text-ink-2">
                    {row.company_name || <span className="text-faint">—</span>}
                    {row.domain && <span className="block text-xs text-muted">{row.domain}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={id.tone}>{id.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {row.issues.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-good">
                        <IconCheck className="size-3.5" /> OK
                      </span>
                    ) : (
                      <ul className="space-y-0.5">
                        {row.issues.map((i) => (
                          <li key={i.code}>{i.text}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {s.total_rows > preview.rows.length && (
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
            Showing the first {preview.rows.length} of {s.total_rows} rows. All rows are validated.
          </p>
        )}
      </div>
    </Page>
  );
}
