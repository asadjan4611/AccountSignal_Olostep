import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router";
import { IconCheckCircle, IconFile, IconShield, IconUpload } from "../components/common/icons";
import { Page } from "../components/common/Layout";
import { Steps } from "../components/common/Steps";
import { Alert, Button, Card, Spinner, WindowCard } from "../components/common/ui";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import type { AppConfig } from "../lib/types";
import { api, draftStore, errorMessage } from "../services/api";

const COLUMNS = [
  { name: "company_name", also: "company, organization, account…", required: true },
  { name: "domain", also: "domain, website, url…", required: true },
  { name: "contact_email", also: "gives the domain when it's missing", required: false },
];

export function Upload({ config }: { config: AppConfig }) {
  useDocumentTitle("Upload accounts");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setError(null);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv")
      return setError(`"${file.name}" isn't a CSV file. Export your sheet as .csv and try again.`);
    if (file.size === 0) return setError("That file is empty.");
    if (file.size > config.max_upload_mb * 1024 * 1024)
      return setError(`That file is larger than ${config.max_upload_mb} MB.`);
    setBusy(file.name);
    try {
      const preview = await api.previewCsv(file);
      draftStore.save(preview);
      navigate(`/new/${preview.upload_id}/preview`);
    } catch (err) {
      setError(errorMessage(err, "Upload failed."));
      setBusy(null);
    }
  }

  async function loadSample() {
    setError(null);
    setBusy("accounts.csv");
    try {
      const res = await fetch("/sample-accounts.csv");
      if (!res.ok) throw new Error("The sample file is missing from this build.");
      await send(new File([await res.blob()], "accounts.csv", { type: "text/csv" }));
    } catch (err) {
      setError(errorMessage(err, "Could not load the sample file."));
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const files = e.dataTransfer.files;
    if (files.length > 1) setError("Drop one file at a time. Using the first one.");
    const file = files[0];
    if (file) void send(file);
  }

  return (
    <Page
      eyebrow="New analysis"
      title="Upload your accounts"
      sub={<Steps current={1} links={{ 0: "/icp?next=upload" }} />}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <WindowCard title={busy ?? "accounts.csv"}>
          <div className="p-5 sm:p-6">
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a CSV file, or drop one here"
              onClick={() => !busy && inputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !busy) {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-4 py-16 text-center transition focus-visible:outline-2 focus-visible:outline-brand ${
                dragging
                  ? "scale-[1.01] border-brand bg-brand-soft"
                  : "border-line-strong bg-bg-soft hover:border-brand/50 hover:bg-brand-soft/40"
              }`}
            >
              <div
                className={`grid size-14 place-items-center rounded-2xl bg-white text-brand shadow-(--shadow-lift) transition ${
                  dragging ? "-translate-y-1" : "group-hover:-translate-y-0.5"
                }`}
              >
                {busy ? <Spinner className="size-6" /> : <IconUpload className="size-6" />}
              </div>
              <div>
                <p className="text-[17px] text-ink">
                  {busy
                    ? "Reading and validating…"
                    : dragging
                      ? "Drop it!"
                      : "Drag and drop your CSV here"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  or click to browse · up to {config.max_upload_mb} MB ·{" "}
                  {config.max_rows.toLocaleString()} rows
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                tabIndex={-1}
                aria-label="CSV file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void send(file);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <IconFile className="size-4" />
                No file handy? Try 5 real companies.
              </p>
              <Button disabled={Boolean(busy)} onClick={() => void loadSample()}>
                Use sample file
              </Button>
            </div>
            {error && (
              <div className="mt-4">
                <Alert tone="bad">{error}</Alert>
              </div>
            )}
          </div>
        </WindowCard>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] text-ink">What the CSV needs</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {COLUMNS.map((c) => (
                <li key={c.name} className="flex gap-2.5">
                  <IconCheckCircle
                    className={`mt-0.5 size-4 shrink-0 ${c.required ? "text-brand" : "text-faint"}`}
                  />
                  <span>
                    <code className="text-ink">{c.name}</code>
                    {!c.required && <span className="text-xs text-muted"> (optional)</span>}
                    <span className="block text-xs text-muted">{c.also}</span>
                  </span>
                </li>
              ))}
            </ul>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-ink p-3 text-[11px] leading-relaxed text-white/85">
              {`company_name,domain,contact_email
Acme,acme.com,john@acme.com
CloudTech,cloudtech.com,`}
            </pre>
            <p className="mt-3 text-xs text-muted">
              Column names are detected automatically; you can fix them next.
            </p>
          </Card>
          <Card className="flex gap-3 p-5 text-xs leading-relaxed text-muted">
            <IconShield className="size-5 shrink-0 text-good" />
            Rows for the same company are researched once. Only company names and domains go to
            Olostep; contact details stay on this server.
          </Card>
        </aside>
      </div>
    </Page>
  );
}
