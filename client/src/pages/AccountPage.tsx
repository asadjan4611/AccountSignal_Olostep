import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { EvidenceBadge, FieldStatusBadge, PriorityBadge } from "../components/common/badges";
import { useToast } from "../components/common/feedback";
import {
  IconActivity,
  IconArrowLeft,
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconCopy,
  IconExternal,
  IconGlobe,
  IconHelp,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTarget,
  IconTrending,
  IconUsers,
  IconX,
} from "../components/common/icons";
import { Page, PageSkeleton } from "../components/common/Layout";
import { Badge, Button, buttonClass, Card, CardHeader, EmptyState } from "../components/common/ui";
import { PRIORITY_COLOR, ScoreRing, SignalTimeline } from "../components/visuals";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { formatValue, hostOf, timeAgo } from "../lib/format";
import type { AccountDetail } from "../lib/types";
import { api, errorMessage } from "../services/api";

const GROUP_LABEL: Record<string, string> = {
  company_profile: "Company profile",
  leadership: "Leadership",
  financial: "Financial information",
  company_size: "Company size",
  business_intelligence: "Business intelligence",
};

function BriefList({
  title,
  icon,
  items,
  empty,
  tone,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  empty: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm text-ink">
        <span className={`grid size-6 place-items-center rounded-md ${tone}`}>{icon}</span>
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2.5 text-sm text-faint">{empty}</p>
      ) : (
        <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-ink-2">
          {items.map((i) => (
            <li key={i} className="flex gap-2">
              <span
                className="mt-2 size-1 shrink-0 rounded-full bg-line-strong"
                aria-hidden="true"
              />
              <span>{i}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function briefText(a: AccountDetail): string {
  const b = a.brief;
  if (!b) return "";
  const sec = (t: string, xs: string[]) =>
    xs.length ? `\n${t}\n${xs.map((x) => `- ${x}`).join("\n")}\n` : "";
  return [
    `${a.company_name ?? a.domain}${a.domain ? ` (${a.domain})` : ""} · ${a.priority ?? ""}`,
    `ICP fit ${a.fit?.score ?? "—"} · Timing ${a.timing?.score ?? "—"}`,
    "",
    b.summary,
    sec("Why it fits", b.whyFit),
    sec("Why now", b.whyNow),
    sec("Gaps", b.gaps),
    sec("Investigate next", b.next),
    a.sources.length ? `Sources:\n${a.sources.map((s) => `- ${s}`).join("\n")}` : "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (http, permissions): fall back to a hidden textarea.
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export function AccountPage() {
  const { runId = "", companyId = "" } = useParams();
  const toast = useToast();
  const [a, setA] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useDocumentTitle(a ? (a.company_name ?? a.domain) : "Account");

  const load = useCallback(() => {
    setError(null);
    setA(null);
    api
      .getAccount(runId, companyId)
      .then(setA)
      .catch((err: unknown) => setError(errorMessage(err, "Could not load the account.")));
  }, [runId, companyId]);
  useEffect(load, [load]);

  if (error) {
    return (
      <Page title="Account not available">
        <EmptyState
          icon={<IconSearch className="size-5" />}
          title={error}
          action={
            <div className="flex gap-2">
              <Button icon={<IconRefresh className="size-4" />} onClick={load}>
                Retry
              </Button>
              <Link to={`/runs/${runId}`} className={buttonClass("primary")}>
                Back to the analysis
              </Link>
            </div>
          }
        />
      </Page>
    );
  }
  if (!a) return <PageSkeleton />;

  const groups = [...new Set(a.fields.map((f) => f.group))];
  const ringColor = a.priority ? PRIORITY_COLOR[a.priority].fg : "var(--brand)";
  const maxPoints = Math.max(30, ...(a.timing?.breakdown.map((b) => b.points) ?? []));

  async function copyBrief() {
    if (!a) return;
    const ok = await copyText(briefText(a));
    if (ok) {
      setCopied(true);
      toast("Brief copied to clipboard");
      setTimeout(() => setCopied(false), 2_000);
    } else toast("Couldn't copy. Select the text instead.", "bad");
  }

  return (
    <Page
      eyebrow={
        <Link
          to={`/runs/${runId}`}
          className="inline-flex items-center gap-1 tracking-normal text-brand normal-case hover:underline"
        >
          <IconArrowLeft className="size-3.5" />
          {a.run.filename}
        </Link>
      }
      title={
        <span className="flex flex-wrap items-center gap-3">
          {a.company_name ?? a.domain}
          {a.priority && <PriorityBadge priority={a.priority} large />}
        </span>
      }
      sub={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {a.domain && (
            <a
              href={`https://${a.domain}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:text-brand"
            >
              <IconGlobe className="size-3.5" />
              {a.domain}
            </a>
          )}
          <span>Researched {timeAgo(a.researched_at)}</span>
          {a.from_cache && <Badge tone="good">Research reused</Badge>}
          {a.run.demo && <Badge>Demo data · fictional company</Badge>}
        </span>
      }
      actions={
        a.brief ? (
          <Button
            icon={
              copied ? <IconCheck className="size-4 text-good" /> : <IconCopy className="size-4" />
            }
            onClick={() => void copyBrief()}
          >
            {copied ? "Copied" : "Copy brief"}
          </Button>
        ) : undefined
      }
    >
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-xs tracking-wide text-muted uppercase">
              <IconSparkles className="size-3.5 text-brand" /> Account brief
            </h2>
            <p className="mt-2 text-[17px] leading-relaxed text-ink">
              {a.brief?.summary ?? "No brief: this account wasn't scored."}
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            {a.fit && (
              <ScoreRing score={a.fit.score} label="ICP fit" sub={a.fit.level} color={ringColor} />
            )}
            {a.timing && (
              <ScoreRing
                score={a.timing.score}
                label="Timing"
                sub={a.timing.breakdown.map((b) => b.type).join(", ") || "no recent signals"}
                color={ringColor}
              />
            )}
          </div>
        </div>
        {a.brief && (
          <div className="grid gap-3 border-t border-line bg-bg-soft p-5 sm:p-6 md:grid-cols-2">
            <BriefList
              title="Why it fits"
              icon={<IconCheck className="size-3.5" />}
              items={a.brief.whyFit}
              empty="No ICP criteria matched."
              tone="bg-good-soft text-good"
            />
            <BriefList
              title="Why now"
              icon={<IconTrending className="size-3.5" />}
              items={a.brief.whyNow}
              empty="No recent signals found."
              tone="bg-brand-soft text-brand"
            />
            <BriefList
              title="Gaps"
              icon={<IconX className="size-3.5" />}
              items={a.brief.gaps}
              empty="No gaps against your ICP."
              tone="bg-seg text-ink-2"
            />
            <BriefList
              title="Investigate next"
              icon={<IconArrowRight className="size-3.5" />}
              items={a.brief.next}
              empty="Nothing to follow up."
              tone="bg-watch-soft text-watch"
            />
          </div>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-muted sm:px-6">
          Built only from researched, cited facts. Buying signals suggest an opportunity; they are
          not proof the company wants to buy.
        </p>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              icon={<IconActivity className="size-4" />}
              title="Buying signals and evidence"
              sub={`${a.signals.filter((s) => s.evidence === "verified").length} of ${a.signals.length} verified against their source`}
            />
            {a.signals.length === 0 ? (
              <p className="px-5 py-6 text-sm text-faint">
                No public signals were found for the last 12 months.
              </p>
            ) : (
              <>
                <div className="border-b border-line px-5 py-4">
                  <SignalTimeline signals={a.signals} />
                </div>
                <ul className="divide-y divide-line">
                  {a.signals.map((s, i) => {
                    const url = s.checked_url ?? s.source_url;
                    return (
                      <li key={`${s.signal}${i}`} className="flex gap-3 px-5 py-4">
                        <span
                          className="mt-1 size-2.5 shrink-0 rounded-full"
                          style={{
                            background:
                              s.evidence === "verified"
                                ? "var(--good)"
                                : s.evidence === "partial"
                                  ? "var(--warn)"
                                  : "var(--skip)",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-[15px] text-ink">{s.signal}</p>
                            <EvidenceBadge status={s.evidence} note={s.evidence_note} />
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            <Badge className="capitalize">{s.type}</Badge>
                            <span className="inline-flex items-center gap-1">
                              <IconCalendar className="size-3.5" />
                              {s.date ? `${s.date} · ${s.age_days}d ago` : "Undated"}
                            </span>
                            <span className="text-brand tabular-nums">+{s.points} pts</span>
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 text-brand hover:underline"
                              >
                                {hostOf(url)} <IconExternal className="size-3" />
                              </a>
                            )}
                          </p>
                          {s.evidence_note && (
                            <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
                              {s.evidence_note}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>

          {groups.map((g) => (
            <Card key={g}>
              <CardHeader icon={<IconBuilding className="size-4" />} title={GROUP_LABEL[g] ?? g} />
              <dl className="divide-y divide-line">
                {a.fields
                  .filter((f) => f.group === g)
                  .map((f) => (
                    <div
                      key={f.key}
                      className="grid gap-1 px-5 py-3 sm:grid-cols-[170px_1fr_auto] sm:gap-4"
                    >
                      <dt className="text-sm text-muted">{f.label}</dt>
                      <dd className="min-w-0 text-[15px] break-words text-ink">
                        {f.value === null ? (
                          <span className="text-faint">Not found</span>
                        ) : (
                          formatValue(f.value)
                        )}
                        {f.note && <span className="block text-xs text-muted">{f.note}</span>}
                        {f.source_url && (
                          <a
                            href={f.source_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs break-all text-brand hover:underline"
                          >
                            {hostOf(f.source_url)} <IconExternal className="size-3" />
                          </a>
                        )}
                      </dd>
                      <dd>
                        <FieldStatusBadge status={f.status} />
                      </dd>
                    </div>
                  ))}
              </dl>
            </Card>
          ))}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          {a.fit && (
            <Card>
              <CardHeader
                icon={<IconTarget className="size-4" />}
                title="ICP checks"
                sub={`${a.fit.checks.filter((c) => c.outcome === "matched").length} of ${a.fit.checks.length} matched`}
              />
              <ul className="space-y-3 p-5 text-sm">
                {a.fit.checks.map((c) => (
                  <li key={c.label} className="flex gap-2.5">
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-full ${
                        c.outcome === "matched"
                          ? "bg-good-soft text-good"
                          : c.outcome === "missed"
                            ? "bg-bad-soft text-bad"
                            : "bg-seg text-muted"
                      }`}
                    >
                      {c.outcome === "matched" ? (
                        <IconCheck className="size-3" />
                      ) : c.outcome === "missed" ? (
                        <IconX className="size-3" />
                      ) : (
                        <IconHelp className="size-3" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="text-ink">{c.label}</span>
                      <span className="block text-xs break-words text-muted">
                        {c.value ?? "No data found"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {a.timing && a.timing.breakdown.length > 0 && (
            <Card>
              <CardHeader
                icon={<IconTrending className="size-4" />}
                title="Timing score"
                sub="Strongest signal per type × recency × evidence"
              />
              <ul className="space-y-2.5 p-5 text-sm">
                {a.timing.breakdown.map((b) => (
                  <li key={b.type}>
                    <div className="flex justify-between">
                      <span className="text-ink capitalize">{b.type}</span>
                      <span className="text-muted tabular-nums">+{b.points}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-seg">
                      <div
                        className="h-full rounded-full bg-brand transition-[width] duration-700"
                        style={{ width: `${(b.points / maxPoints) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {a.contacts.length > 0 && (
            <Card>
              <CardHeader
                icon={<IconUsers className="size-4" />}
                title="Rows in your file"
                sub="Never sent to Olostep"
              />
              <ul className="space-y-1 p-5 text-sm text-ink-2">
                {a.contacts.map((c) => (
                  <li key={`${c.email}${c.name}`} className="truncate">
                    {c.name && <span className="text-ink">{c.name} </span>}
                    {c.email || (!c.name && "—")}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader icon={<IconGlobe className="size-4" />} title="Research sources" />
            <div className="p-5">
              {a.sources.length === 0 ? (
                <p className="text-sm text-faint">None returned.</p>
              ) : (
                <ol className="space-y-1.5 text-sm">
                  {a.sources.map((s, i) => (
                    <li key={s} className="flex gap-2">
                      <span className="w-4 shrink-0 text-right text-xs text-faint tabular-nums">
                        {i + 1}
                      </span>
                      <a
                        href={s}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="truncate text-brand hover:underline"
                      >
                        {hostOf(s)}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-xs text-faint">
                {a.run.demo ? "Demo data" : `${a.credits_used} Olostep credits for this account`}
                {a.provider_ref && a.provider_ref !== "demo" && ` · answer ${a.provider_ref}`}
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
