import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useToast } from "../components/common/feedback";
import {
  IconArrowLeft,
  IconCoins,
  IconPlay,
  IconRefresh,
  IconSearch,
  IconShield,
  IconSparkles,
  IconTarget,
  IconTrending,
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
  Skeleton,
  Switch,
} from "../components/common/ui";
import { useConnection } from "../hooks/useConnection";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { formatCount, formatUsd } from "../lib/format";
import type { AppConfig, CostEstimate, Icp } from "../lib/types";
import { api, draftStore, errorMessage } from "../services/api";

function icpLines(icp: Icp): string[] {
  const lines: string[] = [];
  if (icp.industries.length) lines.push(`Industry: ${icp.industries.join(", ")}`);
  if (icp.locations.length) lines.push(`Location: ${icp.locations.join(", ")}`);
  if (icp.min_employees !== null || icp.max_employees !== null) {
    lines.push(`Employees: ${icp.min_employees ?? 0}–${icp.max_employees ?? "∞"}`);
  }
  if (icp.technologies.length) lines.push(`Technology: ${icp.technologies.join(", ")}`);
  if (icp.funding_stages.length) lines.push(`Stage: ${icp.funding_stages.join(", ")}`);
  if (icp.min_funding_usd !== null) lines.push(`Funding ≥ $${icp.min_funding_usd / 1_000_000}M`);
  if (icp.must_be_hiring) lines.push("Currently hiring");
  return lines;
}

const STEPS = [
  {
    icon: <IconSearch className="size-4" />,
    t: "Research",
    d: "One Olostep Answers request: profile, size, funding, tech stack and dated buying signals.",
  },
  {
    icon: <IconShield className="size-4" />,
    t: "Check evidence",
    d: "Scrape opens each signal's source (Search finds one if missing) to confirm the page supports it.",
  },
  {
    icon: <IconTrending className="size-4" />,
    t: "Score",
    d: "ICP fit × timing (signal type, age and evidence) → Act now, Nurture, Watch or Skip.",
  },
  {
    icon: <IconSparkles className="size-4" />,
    t: "Brief",
    d: "Why it fits, why now, gaps and what to check next, from cited evidence only.",
  },
];

export function Review({ config }: { config: AppConfig }) {
  useDocumentTitle("Review and run");
  const { uploadId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { connection } = useConnection();
  const preview = useMemo(() => draftStore.load(uploadId), [uploadId]);
  const [icp, setIcp] = useState<Icp | null | undefined>(undefined);
  const [verify, setVerify] = useState(true);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIcp = useCallback(() => {
    setIcp(undefined);
    api
      .getIcp()
      .then((r) => setIcp(r.icp))
      .catch(() => setIcp(null));
  }, []);
  useEffect(loadIcp, [loadIcp]);

  useEffect(() => {
    if (!preview || !icp) return;
    const ac = new AbortController();
    setEstimateError(null);
    api
      .estimate(
        {
          upload_id: preview.upload_id,
          column_mapping: preview.column_mapping,
          verify_signals: verify,
        },
        ac.signal,
      )
      .then(setEstimate)
      .catch(
        (err: unknown) =>
          !ac.signal.aborted && setEstimateError(errorMessage(err, "Estimate failed")),
      );
    return () => ac.abort();
  }, [preview, icp, verify, attempt]);

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
        />
      </Page>
    );
  }

  const credits = connection?.ok ? connection.credits : undefined;
  const short = estimate && credits !== undefined && credits < estimate.credits_max;
  const blocked = estimate && credits !== undefined && credits < estimate.credits_min;
  const keyBroken = config.live_configured && connection && !connection.ok;

  async function run() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const { run_id } = await api.createRun({
        upload_id: preview.upload_id,
        column_mapping: preview.column_mapping,
        verify_signals: verify,
      });
      draftStore.clear(uploadId);
      toast("Analysis started");
      navigate(`/runs/${run_id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not start the analysis."));
      setBusy(false);
    }
  }

  const range = (a: number, b: number, f: (n: number) => string) =>
    a === b ? f(a) : `${f(a)}–${f(b)}`;

  return (
    <Page
      eyebrow="New analysis"
      title="Review and run"
      sub={
        <Steps
          current={3}
          links={{ 0: "/icp?next=upload", 1: "/new", 2: `/new/${uploadId}/preview` }}
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              icon={<IconTarget className="size-4" />}
              title="Ideal customer profile"
              action={
                <Link to="/icp" className="text-sm text-brand hover:underline">
                  Edit
                </Link>
              }
            />
            <div className="p-5">
              {icp === undefined ? (
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-6 w-28" />
                </div>
              ) : icp === null ? (
                <Alert
                  tone="warn"
                  title="No ICP yet"
                  action={
                    <Link to="/icp?next=upload" className={buttonClass("secondary", "sm")}>
                      Define it
                    </Link>
                  }
                >
                  Accounts are scored against it, so define it first.
                </Alert>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {icpLines(icp).map((l) => (
                    <Badge key={l} tone="brand" className="py-1 text-[13px]">
                      {l}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="What happens for each company"
              sub={`${preview.summary.companies} companies from ${preview.filename}`}
            />
            <ol className="grid gap-px overflow-hidden bg-line sm:grid-cols-2">
              {STEPS.map((s, i) => (
                <li key={s.t} className="flex gap-3 bg-white p-5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                    {s.icon}
                  </span>
                  <span className="text-sm">
                    <span className="text-ink">
                      {i + 1}. {s.t}
                    </span>
                    <span className="mt-0.5 block leading-relaxed text-muted">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="border-t border-line p-5">
              <Switch
                checked={verify}
                onChange={setVerify}
                label="Check signal sources (recommended)"
                description={`Up to ${estimate?.credits_per_company.evidence_max ?? 13} extra credits per company. Without it, every signal counts as unverified and weighs less in timing.`}
              />
            </div>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden shadow-(--shadow-lift)">
            <div className="sky px-5 py-5">
              <p className="flex items-center gap-1.5 text-sm text-ink-2">
                <IconCoins className="size-4" /> Estimated cost
              </p>
              <div className="mt-2 font-display text-[34px] leading-none text-ink tabular-nums">
                {estimate ? (
                  range(estimate.usd_min, estimate.usd_max, formatUsd)
                ) : estimateError || icp === null ? (
                  "—"
                ) : (
                  <Skeleton className="h-9 w-40" />
                )}
              </div>
              {estimate && (
                <p className="mt-1.5 text-sm text-muted tabular-nums">
                  {range(estimate.credits_min, estimate.credits_max, (n) => formatCount(n))} Olostep
                  credits
                </p>
              )}
            </div>
            <div className="p-5">
              {icp === null && (
                <p className="mb-3 text-sm text-muted">
                  Define your ideal customer to see the cost.
                </p>
              )}
              {estimateError && (
                <Alert
                  tone="bad"
                  action={
                    <Button
                      size="sm"
                      icon={<IconRefresh className="size-3.5" />}
                      onClick={() => setAttempt((a) => a + 1)}
                    >
                      Retry
                    </Button>
                  }
                >
                  {estimateError}
                </Alert>
              )}
              {estimate && (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Companies</dt>
                    <dd className="text-ink tabular-nums">{estimate.companies}</dd>
                  </div>
                  {estimate.cached_companies > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Researched recently</dt>
                      <dd className="text-good tabular-nums">{estimate.cached_companies} free</dd>
                    </div>
                  )}
                  {estimate.skipped_rows > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted">Rows skipped</dt>
                      <dd className="text-warn tabular-nums">{estimate.skipped_rows}</dd>
                    </div>
                  )}
                  {credits !== undefined && (
                    <div className="flex justify-between border-t border-line pt-2">
                      <dt className="text-muted">Your balance</dt>
                      <dd
                        className={`tabular-nums ${blocked ? "text-bad" : short ? "text-warn" : "text-good"}`}
                      >
                        {formatCount(credits)} credits
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted">
                {estimate?.credits_per_company.research ?? 20} credits of research per company, plus
                evidence checks. Failed pages cost nothing. Scoring and briefs are free.
              </p>

              <div className="mt-4 space-y-3">
                {!config.live_configured && (
                  <Alert tone="warn" title="No API key">
                    Add OLOSTEP_API_KEY to .env to analyse real companies. The{" "}
                    <Link to="/" className="text-brand underline">
                      demo
                    </Link>{" "}
                    works without one.
                  </Alert>
                )}
                {keyBroken && (
                  <Alert tone="bad" title="Your API key isn't working">
                    {connection.message}
                  </Alert>
                )}
                {blocked && (
                  <Alert tone="bad" title="Not enough credits">
                    This run needs at least {formatCount(estimate.credits_min)} credits.
                  </Alert>
                )}
                {short && !blocked && (
                  <Alert tone="warn">
                    Your balance may run out before the end. Companies analysed by then are kept.
                  </Alert>
                )}
                {error && <Alert tone="bad">{error}</Alert>}
              </div>

              <div className="mt-5 flex gap-2">
                <Link
                  to={`/new/${uploadId}/preview`}
                  className={buttonClass("secondary")}
                  aria-label="Back to preview"
                >
                  <IconArrowLeft className="size-4" />
                </Link>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  loading={busy}
                  icon={<IconPlay className="size-3.5" />}
                  disabled={
                    !icp ||
                    !config.live_configured ||
                    !estimate ||
                    Boolean(blocked) ||
                    Boolean(keyBroken)
                  }
                  onClick={() => void run()}
                >
                  Run analysis
                </Button>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
