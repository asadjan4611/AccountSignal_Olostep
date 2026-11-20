import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  EvidenceBadge,
  PriorityBadge,
  RunStatusBadge,
  ScoreBar,
} from "../components/common/badges";
import { useConfirm, useToast } from "../components/common/feedback";
import {
  IconBoard,
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconList,
  IconRefresh,
  IconSearch,
  IconTable,
  IconTrash,
  IconX,
  IconZap,
} from "../components/common/icons";
import { Page, PageSkeleton } from "../components/common/Layout";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  Segmented,
  Spinner,
  Tabs,
  TextInput,
} from "../components/common/ui";
import {
  PipelineProgress,
  PRIORITIES,
  PRIORITY_COLOR,
  PriorityMatrix,
  type MatrixPoint,
} from "../components/visuals";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { usePolling } from "../hooks/usePolling";
import { formatUsd, formatValue, timeAgo } from "../lib/format";
import { ACTIVE, type AccountRow, type Priority, type Row, type Run } from "../lib/types";
import { api, errorMessage } from "../services/api";

type Filter = "all" | Priority;
type View = "board" | "table" | "rows";
type Sort = "priority" | "fit" | "timing" | "name";
const VIEWS: readonly View[] = ["board", "table", "rows"];
const PRIORITY_KEY: Record<Priority, keyof Run["priorities"]> = {
  "Act now": "act_now",
  Nurture: "nurture",
  Watch: "watch",
  Skip: "skip",
};

export function RunPage() {
  const { runId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const {
    data: run,
    error,
    refresh,
    reconnecting,
  } = usePolling(() => api.getRun(runId), {
    intervalMs: 1_500,
    active: (r) => ACTIVE.includes(r.status),
    key: runId,
  });
  useDocumentTitle(
    run
      ? ACTIVE.includes(run.status)
        ? `${run.progress.percent}% · ${run.filename}`
        : run.filename
      : "Analysis",
  );
  const [data, setData] = useState<{ accounts: AccountRow[]; rows: Row[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const progressKey = run
    ? `${run.status}:${run.progress.completed}:${run.progress.failed}:${run.progress.processing}`
    : "";
  useEffect(() => {
    if (!progressKey) return;
    let cancelled = false;
    api
      .getAccounts(runId)
      .then((d) => !cancelled && setData(d))
      .catch(() => undefined); // keep the last good list; the next progress tick retries
    return () => {
      cancelled = true;
    };
  }, [runId, progressKey]);

  if (error && !run) {
    return (
      <Page title="Analysis not available">
        <EmptyState
          icon={<IconSearch className="size-5" />}
          title={error}
          action={
            <div className="flex gap-2">
              <Button icon={<IconRefresh className="size-4" />} onClick={() => void refresh()}>
                Retry
              </Button>
              <Link to="/" className={buttonClass("primary")}>
                Dashboard
              </Link>
            </div>
          }
        >
          It may have been deleted, or removed after 30 days.
        </EmptyState>
      </Page>
    );
  }
  if (!run) return <PageSkeleton />;

  const active = ACTIVE.includes(run.status);
  const retryable = run.progress.failed + run.progress.cancelled;

  async function act(name: string, fn: () => Promise<unknown>, done: string) {
    setBusy(name);
    try {
      await fn();
      await refresh();
      toast(done);
    } catch (err) {
      toast(errorMessage(err), "bad");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    const ok = await confirm({
      title: "Cancel this analysis?",
      body: "Companies already analysed are kept. You can retry the rest later.",
      confirmLabel: "Cancel analysis",
      danger: true,
    });
    if (ok) await act("cancel", () => api.cancel(runId), "Analysis cancelled");
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete this analysis?",
      body: "Its results and the contact data from your file are removed from this server. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await api.remove(runId);
      toast("Analysis deleted");
      navigate("/");
    } catch (err) {
      toast(errorMessage(err), "bad");
      setBusy(null);
    }
  }

  const completed = data?.accounts.filter((a) => a.status === "completed" && a.priority) ?? [];

  return (
    <Page
      eyebrow={active ? "Analysis in progress" : "Prioritised accounts"}
      title={run.filename}
      sub={
        <span className="flex flex-wrap items-center gap-2">
          <RunStatusBadge status={run.status} />
          {run.demo && <Badge>Demo data · fictional companies</Badge>}
          <span>
            {run.progress.total} companies · {run.rows.total} rows · started{" "}
            {timeAgo(run.created_at)}
          </span>
          {reconnecting && (
            <Badge tone="warn" dot>
              Reconnecting…
            </Badge>
          )}
        </span>
      }
      actions={
        active ? (
          <Button
            variant="danger"
            loading={busy === "cancel"}
            icon={<IconX className="size-4" />}
            onClick={() => void cancel()}
          >
            Cancel
          </Button>
        ) : (
          <>
            {retryable > 0 && (
              <Button
                loading={busy === "retry"}
                icon={<IconRefresh className="size-4" />}
                onClick={() =>
                  void act(
                    "retry",
                    () => api.retry(runId),
                    `Retrying ${retryable} compan${retryable === 1 ? "y" : "ies"}`,
                  )
                }
              >
                Retry {retryable}
              </Button>
            )}
            <LinkButton
              variant="primary"
              href={api.exportUrl(runId, "csv")}
              download
              icon={<IconDownload className="size-4" />}
              onClick={() => toast("Downloading CSV…", "info")}
            >
              Export CSV
            </LinkButton>
            <LinkButton href={api.exportUrl(runId, "json")} download>
              JSON
            </LinkButton>
            <Button
              variant="ghost"
              aria-label="Delete analysis"
              loading={busy === "delete"}
              icon={<IconTrash className="size-4" />}
              onClick={() => void remove()}
            />
          </>
        )
      }
    >
      {run.error && (
        <div className="mb-4">
          <Alert tone="bad" title="The analysis stopped">
            {run.error}
          </Alert>
        </div>
      )}

      <ProgressCard run={run} />

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {PRIORITIES.map((p) => {
          const n = run.priorities[PRIORITY_KEY[p]];
          const on = filter === p;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(on ? "all" : p)}
              className={`group rounded-xl border bg-white px-4 py-3.5 text-left shadow-(--shadow-card) transition hover:-translate-y-0.5 hover:shadow-(--shadow-lift) focus-visible:outline-2 focus-visible:outline-brand ${
                on ? "border-transparent ring-2" : "border-line"
              }`}
              style={
                on ? ({ "--tw-ring-color": PRIORITY_COLOR[p].fg } as CSSProperties) : undefined
              }
            >
              <dt className="flex items-center gap-2 text-xs text-muted">
                <span
                  className="size-2 rounded-full"
                  style={{ background: PRIORITY_COLOR[p].fg }}
                />
                {p}
              </dt>
              <dd
                className="mt-1 font-display text-3xl tabular-nums"
                style={{ color: n ? PRIORITY_COLOR[p].fg : "var(--faint)" }}
              >
                {n}
              </dd>
              <dd className="text-[11px] text-faint group-hover:text-muted">
                {on ? "Showing only these · clear" : "Show only these"}
              </dd>
            </button>
          );
        })}
      </dl>

      {completed.length > 0 && <Overview runId={runId} accounts={completed} />}

      {data ? (
        <Accounts
          runId={runId}
          run={run}
          accounts={data.accounts}
          rows={data.rows}
          filter={filter}
          setFilter={setFilter}
        />
      ) : (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading accounts…
        </div>
      )}
    </Page>
  );
}

function ProgressCard({ run }: { run: Run }) {
  const p = run.progress;
  const active = ACTIVE.includes(run.status);
  const done = p.completed + p.failed + p.cancelled;
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm text-muted">
              {done} of {p.total} companies analysed
              {p.failed > 0 && <span className="text-bad"> · {p.failed} failed</span>}
            </p>
            <p className="font-display text-3xl text-ink tabular-nums">{p.percent}%</p>
          </div>
          <div
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-seg"
            role="progressbar"
            aria-label="Progress"
            aria-valuenow={p.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${active ? "progress-stripes bg-brand" : p.failed ? "bg-watch" : "bg-good"}`}
              style={{ width: `${Math.max(active ? 3 : 0, p.percent)}%` }}
            />
          </div>
          <div className="mt-3 min-h-5 text-sm">
            {active ? (
              <p className="flex items-center gap-2 text-ink">
                <Spinner className="size-4 text-brand" />
                {run.current ? (
                  <span className="min-w-0 truncate">
                    {run.current.company} <span className="text-muted">· {run.current.task}</span>
                  </span>
                ) : (
                  <span className="text-muted">Waiting in the queue…</span>
                )}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-muted">
                <IconCheckCircle className="size-4 text-good" />
                {run.signals.verified} of {run.signals.total} signals verified against their source
                {p.from_cache > 0 && ` · ${p.from_cache} reused from earlier research`}
              </p>
            )}
          </div>
        </div>
        <PipelineProgress run={run} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-bg-soft px-5 py-2.5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <IconClock className="size-3.5" />
          {run.finished_at
            ? `Finished ${timeAgo(run.finished_at)}`
            : `Started ${timeAgo(run.started_at ?? run.created_at)}`}
          {!run.verify_signals && " · source checks off"}
        </span>
        <span className="tabular-nums">
          {run.demo
            ? "Demo: no credits used"
            : `${run.credits_used} credits · ${formatUsd(run.usd_used)}`}
        </span>
      </div>
    </Card>
  );
}

function Overview({ runId, accounts }: { runId: string; accounts: AccountRow[] }) {
  const points: MatrixPoint[] = accounts.map((a) => ({
    key: a.key,
    label: a.company_name ?? a.domain ?? "Unknown",
    fit: a.fit?.score ?? 0,
    timing: a.timing?.score ?? 0,
    priority: a.priority as Priority,
    href: a.company_id ? `/runs/${runId}/accounts/${a.company_id}` : undefined,
  }));
  const top = accounts.filter((a) => a.priority === "Act now").slice(0, 3);
  const callFirst = top.length ? top : accounts.slice(0, 3);
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <Card>
        <CardHeader
          title="Priority matrix"
          sub="Each dot is an account. Click one for its brief."
        />
        <div className="p-4">
          <PriorityMatrix points={points} />
        </div>
      </Card>
      <Card>
        <CardHeader
          icon={<IconZap className="size-4" />}
          title={top.length ? "Contact first" : "Best of this list"}
          sub={
            top.length
              ? "Strong fit with fresh, evidenced signals"
              : "No account reached Act now yet"
          }
        />
        <ul className="divide-y divide-line">
          {callFirst.map((a, i) => (
            <li key={a.key}>
              <Link
                to={a.company_id ? `/runs/${runId}/accounts/${a.company_id}` : "#"}
                className="group flex gap-3 px-5 py-4 transition hover:bg-bg-soft"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs text-brand tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] text-ink group-hover:text-brand">
                      {a.company_name ?? a.domain}
                    </span>
                    {a.priority && <PriorityBadge priority={a.priority} />}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm text-muted">
                    {a.top_signal?.signal ?? a.summary ?? "No recent signals"}
                  </span>
                </span>
                <IconChevronRight className="mt-1 size-4 shrink-0 text-faint group-hover:text-brand" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const statusLine = (a: AccountRow) =>
  a.status === "processing"
    ? "Analysing…"
    : a.status === "failed"
      ? `Failed: ${a.error ?? "unknown error"}`
      : a.status === "cancelled"
        ? "Cancelled"
        : a.status === "pending"
          ? "Queued"
          : null;

function AccountName({ runId, a }: { runId: string; a: AccountRow }) {
  const name = a.company_name ?? a.domain ?? "Unknown";
  return a.company_id && a.status === "completed" ? (
    <Link
      to={`/runs/${runId}/accounts/${a.company_id}`}
      className="block truncate text-ink hover:text-brand hover:underline"
    >
      {name}
    </Link>
  ) : (
    <span className="block truncate text-ink">{name}</span>
  );
}

function Accounts({
  runId,
  run,
  accounts,
  rows,
  filter,
  setFilter,
}: {
  runId: string;
  run: Run;
  accounts: AccountRow[];
  rows: Row[];
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const [view, setView] = useLocalStorage<View>("accountsignal:view", "board", VIEWS);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("priority");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = accounts.filter(
      (a) =>
        (filter === "all" || a.priority === filter) &&
        (!q ||
          `${a.company_name ?? ""} ${a.domain ?? ""} ${a.top_signal?.signal ?? ""}`
            .toLowerCase()
            .includes(q)),
    );
    if (sort === "priority") return list; // server order: priority, then fit + timing
    return [...list].sort((x, y) =>
      sort === "name"
        ? (x.company_name ?? x.domain ?? "").localeCompare(y.company_name ?? y.domain ?? "")
        : sort === "fit"
          ? (y.fit?.score ?? -1) - (x.fit?.score ?? -1)
          : (y.timing?.score ?? -1) - (x.timing?.score ?? -1),
    );
  }, [accounts, filter, query, sort]);

  const pendingCards = accounts.filter((a) => !a.priority);
  const empty =
    run.status === "completed" || !ACTIVE.includes(run.status)
      ? query || filter !== "all"
        ? "No accounts match. Clear the search or filter."
        : "No accounts in this group."
      : "Results appear here as companies finish.";

  return (
    <section className="mt-8">
      <Tabs<View>
        label="Views"
        value={view}
        onChange={setView}
        options={[
          {
            value: "board",
            label: (
              <>
                <IconBoard className="size-4" /> Board
              </>
            ),
          },
          {
            value: "table",
            label: (
              <>
                <IconTable className="size-4" /> Table · {accounts.length}
              </>
            ),
          },
          {
            value: "rows",
            label: (
              <>
                <IconList className="size-4" /> Original rows · {rows.length}
              </>
            ),
          },
        ]}
      />

      {view !== "rows" && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-72">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <TextInput
              type="search"
              aria-label="Search accounts"
              placeholder="Search companies or signals"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filter !== "all" && (
              <Button
                size="sm"
                variant="ghost"
                icon={<IconX className="size-3.5" />}
                onClick={() => setFilter("all")}
              >
                {filter}
              </Button>
            )}
            {view === "table" && (
              <Segmented<Sort>
                label="Sort by"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "priority", label: "Priority" },
                  { value: "fit", label: "Fit" },
                  { value: "timing", label: "Timing" },
                  { value: "name", label: "A–Z" },
                ]}
              />
            )}
          </div>
        </div>
      )}

      {view === "board" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PRIORITIES.filter((p) => filter === "all" || filter === p).map((p) => {
            const list = visible.filter((a) => a.priority === p);
            return (
              <div key={p} className="rounded-xl border border-line bg-bg-soft/60 p-2">
                <h3 className="flex items-center justify-between px-2 py-1.5 text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: PRIORITY_COLOR[p].fg }}
                    />
                    {p}
                  </span>
                  <span className="text-muted tabular-nums">{list.length}</span>
                </h3>
                <ul className="mt-1 space-y-2">
                  {list.map((a) => (
                    <li key={a.key}>
                      <BoardCard runId={runId} a={a} />
                    </li>
                  ))}
                  {list.length === 0 && (
                    <li className="px-2 py-6 text-center text-xs text-faint">None</li>
                  )}
                </ul>
              </div>
            );
          })}
          {pendingCards.length > 0 && filter === "all" && (
            <div className="rounded-xl border border-dashed border-line-strong p-3 md:col-span-2 xl:col-span-4">
              <p className="text-xs text-muted">Not scored yet · {pendingCards.length}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {pendingCards.map((a) => (
                  <li
                    key={a.key}
                    title={a.error ?? undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs ${a.status === "failed" ? "border-bad/30 text-bad" : "border-line text-ink-2"}`}
                  >
                    {a.status === "processing" && <Spinner className="size-3 text-brand" />}
                    {a.company_name ?? a.domain ?? "Unknown"}
                    <span className="text-muted">· {statusLine(a)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {view === "table" && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white shadow-(--shadow-card)">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-bg-soft text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-normal">Account</th>
                <th className="px-3 py-2.5 font-normal">Priority</th>
                <th className="px-3 py-2.5 font-normal">ICP fit</th>
                <th className="px-3 py-2.5 font-normal">Timing</th>
                <th className="px-3 py-2.5 font-normal">Why now</th>
                <th className="px-3 py-2.5 font-normal">Industry · size</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr
                  key={a.key}
                  className="border-t border-line align-top transition hover:bg-bg-soft"
                >
                  <td className="max-w-60 px-4 py-3">
                    <AccountName runId={runId} a={a} />
                    <span className="block truncate text-xs text-muted">
                      {a.domain ?? "identified by name"} · {a.contacts} row
                      {a.contacts === 1 ? "" : "s"}
                    </span>
                    {statusLine(a) && (
                      <span
                        className={`mt-1 block text-xs ${a.status === "failed" ? "text-bad" : "text-muted"}`}
                        title={a.error ?? undefined}
                      >
                        {statusLine(a)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {a.priority && <PriorityBadge priority={a.priority} />}
                  </td>
                  <td className="px-3 py-3">
                    {a.fit && <ScoreBar score={a.fit.score} label="ICP fit" />}
                  </td>
                  <td className="px-3 py-3">
                    {a.timing && <ScoreBar score={a.timing.score} label="Timing" />}
                  </td>
                  <td className="max-w-80 px-3 py-3">
                    {a.top_signal ? (
                      <span className="block">
                        <span className="line-clamp-2 text-ink">{a.top_signal.signal}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {a.top_signal.age_days !== null
                            ? `${a.top_signal.age_days}d ago`
                            : "undated"}
                          <EvidenceBadge
                            status={a.top_signal.evidence}
                            note={a.top_signal.evidence_note}
                          />
                        </span>
                      </span>
                    ) : a.status === "completed" ? (
                      <span className="text-faint">No recent signals</span>
                    ) : null}
                  </td>
                  <td className="max-w-56 px-3 py-3 text-ink-2">
                    <span className="block truncate">
                      {formatValue(a.highlights.industry?.value ?? null) || "—"}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {formatValue(a.highlights.employee_count?.value ?? null)}
                    </span>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">
                    {empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "rows" && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white shadow-(--shadow-card)">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-bg-soft text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-normal">Company</th>
                <th className="px-4 py-2.5 font-normal">Domain</th>
                <th className="px-4 py-2.5 font-normal">Contact</th>
                <th className="px-4 py-2.5 font-normal">Status</th>
                <th className="px-4 py-2.5 font-normal">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-top hover:bg-bg-soft">
                  <td className="px-4 py-2.5 text-ink">{r.company_name || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">{r.domain ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">{r.email || r.contact_name || "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge
                      tone={
                        r.status === "enriched" ? "good" : r.status === "failed" ? "bad" : "neutral"
                      }
                      dot
                    >
                      {r.status === "enriched" ? "analysed" : r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {[...r.issues.map((i) => i.text), r.message].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view !== "rows" && accounts.length === 0 && (
        <div className="mt-4">
          <EmptyState icon={<Spinner className="size-5" />} title="Getting started">
            {empty}
          </EmptyState>
        </div>
      )}
    </section>
  );
}

function BoardCard({ runId, a }: { runId: string; a: AccountRow }) {
  const href = a.company_id ? `/runs/${runId}/accounts/${a.company_id}` : undefined;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[15px] text-ink group-hover:text-brand">
          {a.company_name ?? a.domain}
        </p>
        {a.from_cache && <Badge tone="good">cached</Badge>}
      </div>
      <p className="truncate text-xs text-muted">
        {[
          formatValue(a.highlights.industry?.value ?? null),
          formatValue(a.highlights.employee_count?.value ?? null),
        ]
          .filter(Boolean)
          .join(" · ") || a.domain}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {a.fit && (
          <div>
            <p className="text-[11px] text-muted">Fit</p>
            <ScoreBar score={a.fit.score} label="ICP fit" />
          </div>
        )}
        {a.timing && (
          <div>
            <p className="text-[11px] text-muted">Timing</p>
            <ScoreBar score={a.timing.score} label="Timing" />
          </div>
        )}
      </div>
      {a.top_signal && (
        <p className="mt-3 line-clamp-2 border-t border-line pt-2.5 text-xs leading-relaxed text-ink-2">
          <span className={a.top_signal.evidence === "verified" ? "text-good" : "text-muted"}>
            {a.top_signal.evidence === "verified" ? "✓ " : ""}
          </span>
          {a.top_signal.signal}
        </p>
      )}
    </>
  );
  const cls =
    "group block rounded-lg border border-line bg-white p-3 shadow-(--shadow-card) transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-(--shadow-lift)";
  return href ? (
    <Link to={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
