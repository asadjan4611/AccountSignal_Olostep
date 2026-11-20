import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { RunStatusBadge } from "../components/common/badges";
import { useToast } from "../components/common/feedback";
import {
  IconArrowRight,
  IconCheckCircle,
  IconChevronRight,
  IconCoins,
  IconKey,
  IconLayers,
  IconPlay,
  IconRefresh,
  IconSearch,
  IconShield,
  IconTarget,
  IconTrending,
  IconUpload,
  IconZap,
} from "../components/common/icons";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  EmptyState,
  Skeleton,
  Stat,
} from "../components/common/ui";
import { DemoVideo } from "../components/DemoVideo";
import { PriorityBar } from "../components/visuals";
import { useConnection } from "../hooks/useConnection";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { usePolling } from "../hooks/usePolling";
import { formatCount, formatUsd, timeAgo } from "../lib/format";
import { ACTIVE, type AppConfig, type Run } from "../lib/types";
import { api, errorMessage } from "../services/api";

const STAGES = [
  {
    icon: <IconTarget className="size-4" />,
    title: "Define your ICP",
    sub: "What a great customer looks like",
  },
  {
    icon: <IconUpload className="size-4" />,
    title: "Upload accounts",
    sub: "company_name + domain, email optional",
  },
  {
    icon: <IconSearch className="size-4" />,
    title: "Olostep researches",
    sub: "Answers, then Search + Scrape for proof",
  },
  {
    icon: <IconTrending className="size-4" />,
    title: "Score & rank",
    sub: "ICP fit × timing → who to call first",
  },
] as const;

export function Dashboard({ config }: { config: AppConfig }) {
  useDocumentTitle("Dashboard");
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, reconnecting, refresh } = usePolling(api.listRuns, {
    intervalMs: 3_000,
    active: (d) => d.runs.some((r) => ACTIVE.includes(r.status)),
  });
  const [demoBusy, setDemoBusy] = useState(false);

  async function startDemo() {
    setDemoBusy(true);
    try {
      const { run_id } = await api.runDemo();
      navigate(`/runs/${run_id}`);
    } catch (err) {
      toast(errorMessage(err, "Could not start the demo."), "bad");
      setDemoBusy(false);
    }
  }

  const stats = data?.stats;

  return (
    <>
      <section className="sky relative overflow-hidden border-b border-line">
        <div className="bg-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_60%_at_75%_40%,black,transparent)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-in">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs text-ink-2 backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              Open source · built on Olostep Answers, Search and Scrape
            </p>
            <h1 className="mt-5 font-display text-[36px] leading-[1.08] tracking-tight text-ink sm:text-[50px]">
              Know which accounts to contact first,{" "}
              <span className="text-gradient">and why now.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">
              Upload companies. AccountSignal researches each one with live web data, checks every
              buying signal against its source, and ranks them by ICP fit and timing, with a short
              brief you can act on.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="lg"
                loading={demoBusy}
                icon={<IconPlay className="size-3.5" />}
                onClick={() => void startDemo()}
              >
                Try the demo
              </Button>
              <Link to="/icp?next=upload" className={buttonClass("secondary", "lg")}>
                Analyse your accounts
                <IconArrowRight className="size-4" />
              </Link>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <IconCheckCircle className="size-3.5 text-good" />
              Fictional companies · no API key · no credits · about 10 seconds
            </p>
          </div>

          <div className="animate-in" style={{ animationDelay: "120ms" }}>
            <DemoVideo />
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STAGES.map((s, i) => (
              <li
                key={s.title}
                className="animate-in flex gap-3 rounded-xl border border-white/80 bg-white/80 px-4 py-3.5 backdrop-blur"
                style={{ animationDelay: `${120 + i * 70}ms` }}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  {s.icon}
                </span>
                <span className="min-w-0">
                  <span className="text-[11px] text-muted">Step {i + 1}</span>
                  <span className="block text-[15px] text-ink">{s.title}</span>
                  <span className="block text-xs text-muted">{s.sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <ConnectionCard configured={config.live_configured} />

        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Accounts analysed"
            icon={<IconLayers className="size-3.5" />}
            value={stats ? formatCount(stats.accounts) : <Skeleton className="h-7 w-12" />}
          />
          <Stat
            label="Act now"
            icon={<IconZap className="size-3.5 text-act" />}
            tone="text-act"
            value={stats ? formatCount(stats.act_now) : <Skeleton className="h-7 w-12" />}
          />
          <Stat
            label="Verified signals"
            icon={<IconShield className="size-3.5 text-good" />}
            tone="text-good"
            value={stats ? formatCount(stats.verified_signals) : <Skeleton className="h-7 w-12" />}
          />
          <Stat
            label="Olostep credits used"
            icon={<IconCoins className="size-3.5" />}
            value={stats ? formatCount(stats.credits_used) : <Skeleton className="h-7 w-12" />}
          />
        </dl>

        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl tracking-tight text-ink">Recent analyses</h2>
              <p className="mt-0.5 text-sm text-muted">Kept for 30 days on this server.</p>
            </div>
            {reconnecting && (
              <span className="flex items-center gap-1.5 text-xs text-watch">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-current" />
                Reconnecting…
              </span>
            )}
          </div>

          {error && !data && (
            <div className="mt-4">
              <Alert
                tone="bad"
                title="Couldn't load your analyses"
                action={
                  <Button
                    size="sm"
                    icon={<IconRefresh className="size-3.5" />}
                    onClick={() => void refresh()}
                  >
                    Retry
                  </Button>
                }
              >
                {error}
              </Alert>
            </div>
          )}
          {!data && !error && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          )}
          {data && data.runs.length === 0 && (
            <div className="mt-4">
              <EmptyState
                icon={<IconPlay className="size-5" />}
                title="No analyses yet"
                action={
                  <Button variant="primary" loading={demoBusy} onClick={() => void startDemo()}>
                    Run the demo
                  </Button>
                }
              >
                The demo shows a full result in seconds: a ranked list, evidence checks and briefs.
              </EmptyState>
            </div>
          )}
          {data && data.runs.length > 0 && (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {data.runs.map((run, i) => (
                <RunCard key={run.id} run={run} delay={i * 40} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function ConnectionCard({ configured }: { configured: boolean }) {
  const { connection, checking, recheck } = useConnection();
  const toast = useToast();
  const ok = connection?.ok;
  return (
    <section
      id="connection"
      className="scroll-mt-20 flex flex-col gap-4 rounded-xl border border-line bg-white p-5 shadow-(--shadow-card) md:flex-row md:items-center md:justify-between"
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${
            ok
              ? "bg-good-soft text-good"
              : configured
                ? "bg-bad-soft text-bad"
                : "bg-watch-soft text-watch"
          }`}
        >
          <IconKey className="size-5" />
        </span>
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-[15px] text-ink">
            Olostep connection
            {checking ? (
              <Badge>Checking…</Badge>
            ) : ok ? (
              <Badge tone="good" dot>
                Connected
              </Badge>
            ) : configured ? (
              <Badge tone="bad" dot>
                Not working
              </Badge>
            ) : (
              <Badge tone="warn" dot>
                Demo mode
              </Badge>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {!configured
              ? "No OLOSTEP_API_KEY yet. The demo works; add a key to .env and restart to analyse real companies."
              : connection
                ? ok
                  ? `${formatCount(connection.credits ?? 0)} credits left${connection.plan ? ` on the ${connection.plan} plan` : ""}. Checking is free.`
                  : connection.message
                : "Checking your key (free)…"}
          </p>
        </div>
      </div>
      {configured && (
        <Button
          loading={checking}
          icon={<IconRefresh className="size-4" />}
          onClick={async () => {
            const c = await recheck();
            if (c?.ok) toast(`Key works · ${formatCount(c.credits ?? 0)} credits left`);
            else if (c) toast(c.message, "bad");
          }}
        >
          Check again
        </Button>
      )}
    </section>
  );
}

function RunCard({ run, delay }: { run: Run; delay: number }) {
  const active = ACTIVE.includes(run.status);
  return (
    <li className="animate-in" style={{ animationDelay: `${delay}ms` }}>
      <Link
        to={`/runs/${run.id}`}
        className="group block rounded-xl border border-line bg-white p-4 shadow-(--shadow-card) transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-(--shadow-lift) focus-visible:outline-2 focus-visible:outline-brand"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-[15px] text-ink group-hover:text-brand">
              <span className="truncate">{run.filename}</span>
              {run.demo && <Badge>Demo</Badge>}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {run.progress.total} companies · {timeAgo(run.created_at)} ·{" "}
              {run.demo ? "free" : `${run.credits_used} cr · ${formatUsd(run.usd_used)}`}
            </p>
          </div>
          <RunStatusBadge status={run.status} />
        </div>
        {active ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-seg">
              <div
                className="progress-stripes h-full rounded-full bg-brand transition-[width] duration-700"
                style={{ width: `${Math.max(4, run.progress.percent)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {run.progress.percent}% · {run.current?.company ?? "waiting in queue"}
            </p>
          </div>
        ) : (
          <>
            <PriorityBar counts={run.priorities} className="mt-4" />
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-muted">
                <span>
                  <span className="text-act tabular-nums">{run.priorities.act_now}</span> act now
                </span>
                <span>
                  <span className="text-nurture tabular-nums">{run.priorities.nurture}</span>{" "}
                  nurture
                </span>
                <span>
                  <span className="text-good tabular-nums">{run.signals.verified}</span>/
                  {run.signals.total} signals verified
                </span>
              </span>
              <IconChevronRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </div>
          </>
        )}
      </Link>
    </li>
  );
}
