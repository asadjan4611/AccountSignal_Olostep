import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import type { EvidenceStatus, Priority, Run, SignalDto } from "../lib/types";
import { IconCheck } from "./common/icons";

/* ── Priority colours ───────────────────────────────────────────────────── */

export const PRIORITY_COLOR: Record<Priority, { fg: string; soft: string }> = {
  "Act now": { fg: "var(--act)", soft: "var(--act-soft)" },
  Nurture: { fg: "var(--nurture)", soft: "var(--nurture-soft)" },
  Watch: { fg: "var(--watch)", soft: "var(--watch-soft)" },
  Skip: { fg: "var(--skip)", soft: "var(--skip-soft)" },
};

export const PRIORITIES: readonly Priority[] = ["Act now", "Nurture", "Watch", "Skip"];

/** Fit/timing thresholds, mirrored from server/src/services/scoring.service.ts. */
export const FIT_LINE = 60;
export const TIMING_LINE = 50;

/* ── Priority matrix ────────────────────────────────────────────────────── */

export interface MatrixPoint {
  key: string;
  label: string;
  fit: number;
  timing: number;
  priority: Priority;
  href?: string;
}

const W = 420;
const H = 310;
const PAD = { l: 34, r: 12, t: 22, b: 30 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;
const px = (timing: number) => PAD.l + (timing / 100) * PW;
const py = (fit: number) => PAD.t + (1 - fit / 100) * PH;

/** Spread dots that land on (almost) the same spot so every account stays visible. */
function layout(points: MatrixPoint[]) {
  const seen = new Map<string, number>();
  return points.map((p) => {
    const cell = `${Math.round(p.timing / 4)}:${Math.round(p.fit / 4)}`;
    const n = seen.get(cell) ?? 0;
    seen.set(cell, n + 1);
    const angle = n * 2.4;
    const radius = n === 0 ? 0 : 7 + n * 2;
    return {
      ...p,
      x: Math.min(W - PAD.r - 6, Math.max(PAD.l + 6, px(p.timing) + Math.cos(angle) * radius)),
      y: Math.min(PAD.t + PH - 6, Math.max(PAD.t + 6, py(p.fit) + Math.sin(angle) * radius)),
    };
  });
}

export function PriorityMatrix({
  points,
  interactive = true,
  className = "",
}: {
  points: MatrixPoint[];
  interactive?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null);
  const placed = useMemo(() => layout(points), [points]);
  const active = placed.find((p) => p.key === hover) ?? null;
  const quadrants: {
    p: Priority;
    x: number;
    y: number;
    w: number;
    h: number;
    align: "start" | "end";
  }[] = [
    {
      p: "Nurture",
      x: PAD.l,
      y: PAD.t,
      w: px(TIMING_LINE) - PAD.l,
      h: py(FIT_LINE) - PAD.t,
      align: "start",
    },
    {
      p: "Act now",
      x: px(TIMING_LINE),
      y: PAD.t,
      w: W - PAD.r - px(TIMING_LINE),
      h: py(FIT_LINE) - PAD.t,
      align: "end",
    },
    {
      p: "Skip",
      x: PAD.l,
      y: py(FIT_LINE),
      w: px(TIMING_LINE) - PAD.l,
      h: PAD.t + PH - py(FIT_LINE),
      align: "start",
    },
    {
      p: "Watch",
      x: px(TIMING_LINE),
      y: py(FIT_LINE),
      w: W - PAD.r - px(TIMING_LINE),
      h: PAD.t + PH - py(FIT_LINE),
      align: "end",
    },
  ];

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role={interactive ? "group" : "img"}
        aria-label="Accounts by ICP fit (vertical) and timing (horizontal)"
      >
        {quadrants.map((q) => (
          <g key={q.p}>
            <rect
              x={q.x}
              y={q.y}
              width={q.w}
              height={q.h}
              fill={PRIORITY_COLOR[q.p].soft}
              opacity={q.p === "Act now" ? 0.95 : 0.6}
            />
            <text
              x={q.align === "start" ? q.x + 8 : q.x + q.w - 8}
              y={q.y === PAD.t ? PAD.t - 7 : PAD.t + PH - 7}
              textAnchor={q.align}
              fontSize="11"
              fill={PRIORITY_COLOR[q.p].fg}
              style={{ fontWeight: 600, letterSpacing: "0.02em" }}
            >
              {q.p.toUpperCase()}
            </text>
          </g>
        ))}
        <line
          x1={px(TIMING_LINE)}
          x2={px(TIMING_LINE)}
          y1={PAD.t}
          y2={PAD.t + PH}
          stroke="var(--line-strong)"
          strokeDasharray="3 3"
        />
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={py(FIT_LINE)}
          y2={py(FIT_LINE)}
          stroke="var(--line-strong)"
          strokeDasharray="3 3"
        />
        <rect x={PAD.l} y={PAD.t} width={PW} height={PH} fill="none" stroke="var(--line)" />
        {[0, 50, 100].map((v) => (
          <text
            key={`x${v}`}
            x={px(v)}
            y={H - 12}
            textAnchor="middle"
            fontSize="10"
            fill="var(--muted)"
          >
            {v}
          </text>
        ))}
        {[0, 60, 100].map((v) => (
          <text
            key={`y${v}`}
            x={PAD.l - 6}
            y={py(v) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--muted)"
          >
            {v}
          </text>
        ))}
        <text x={PAD.l + PW / 2} y={H - 1} textAnchor="middle" fontSize="10" fill="var(--muted)">
          Timing →
        </text>
        <text
          x={10}
          y={PAD.t + PH / 2}
          textAnchor="middle"
          fontSize="10"
          fill="var(--muted)"
          transform={`rotate(-90 10 ${PAD.t + PH / 2})`}
        >
          ICP fit →
        </text>

        {placed.map((p, i) => {
          const c = PRIORITY_COLOR[p.priority].fg;
          const isHover = hover === p.key;
          const open = () => p.href && navigate(p.href);
          return (
            <g
              key={p.key}
              className="pop-in"
              tabIndex={interactive && p.href ? 0 : undefined}
              role={interactive && p.href ? "link" : undefined}
              aria-label={
                interactive
                  ? `${p.label}: ${p.priority}, fit ${p.fit}, timing ${p.timing}`
                  : undefined
              }
              onMouseEnter={() => interactive && setHover(p.key)}
              onMouseLeave={() => interactive && setHover(null)}
              onFocus={() => interactive && setHover(p.key)}
              onBlur={() => interactive && setHover(null)}
              onClick={() => interactive && open()}
              onKeyDown={(e) => {
                if (interactive && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  open();
                }
              }}
              cursor={interactive && p.href ? "pointer" : undefined}
              style={{ outline: "none", animationDelay: `${i * 45}ms` }}
            >
              {p.priority === "Act now" && (
                <circle cx={p.x} cy={p.y} r={6} fill={c} className="ping-ring" />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHover ? 8 : 6}
                fill={c}
                stroke="white"
                strokeWidth={2}
              />
            </g>
          );
        })}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-(--shadow-pop)"
          style={{ left: `${(active.x / W) * 100}%`, top: `calc(${(active.y / H) * 100}% - 12px)` }}
        >
          <span className="block">{active.label}</span>
          <span className="text-white/70">
            {active.priority} · fit {active.fit} · timing {active.timing}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Score ring ─────────────────────────────────────────────────────────── */

export function ScoreRing({
  score,
  label,
  sub,
  color = "var(--brand)",
  size = 92,
}: {
  score: number;
  label: string;
  sub?: string;
  color?: string;
  size?: number;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--seg)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - clamped / 100)}
            className="ring-draw"
            style={{ "--ring-circ": `${circ}` } as CSSProperties}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-display text-2xl text-ink tabular-nums">
          {score}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {sub && <p className="text-xs text-muted capitalize">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Priority bar (stacked counts) ──────────────────────────────────────── */

export function PriorityBar({
  counts,
  className = "",
}: {
  counts: Run["priorities"];
  className?: string;
}) {
  const parts: [Priority, number][] = [
    ["Act now", counts.act_now],
    ["Nurture", counts.nurture],
    ["Watch", counts.watch],
    ["Skip", counts.skip],
  ];
  const total = parts.reduce((s, [, n]) => s + n, 0);
  return (
    <div
      className={`flex h-2 overflow-hidden rounded-full bg-seg ${className}`}
      role="img"
      aria-label={parts.map(([p, n]) => `${p} ${n}`).join(", ")}
    >
      {total > 0 &&
        parts.map(([p, n]) =>
          n > 0 ? (
            <span
              key={p}
              title={`${p}: ${n}`}
              className="h-full transition-[width] duration-700 not-last:border-r-2 not-last:border-white"
              style={{ width: `${(n / total) * 100}%`, background: PRIORITY_COLOR[p].fg }}
            />
          ) : null,
        )}
    </div>
  );
}

/* ── Signal timeline (last 12 months) ───────────────────────────────────── */

const EVIDENCE_COLOR: Record<EvidenceStatus, string> = {
  verified: "var(--good)",
  partial: "var(--warn)",
  unverified: "var(--skip)",
};

export function SignalTimeline({ signals }: { signals: SignalDto[] }) {
  const dated = signals.filter((s) => s.age_days !== null && s.age_days <= 365);
  const undated = signals.length - dated.length;
  const left = (age: number) => `${100 - (Math.max(0, age) / 365) * 100}%`;
  const zones = [
    { from: 365, to: 180, label: "6–12 mo", cls: "bg-seg/60" },
    { from: 180, to: 90, label: "3–6 mo", cls: "bg-brand-soft/50" },
    { from: 90, to: 30, label: "1–3 mo", cls: "bg-brand-soft" },
    { from: 30, to: 0, label: "30 days", cls: "bg-brand/15" },
  ];
  return (
    <div>
      <div className="relative h-12 overflow-hidden rounded-lg border border-line">
        {zones.map((z) => (
          <div
            key={z.label}
            className={`absolute inset-y-0 ${z.cls}`}
            style={{ left: left(z.from), right: `${(z.to / 365) * 100}%` }}
          >
            <span className="absolute bottom-1 left-1.5 text-[10px] text-muted">{z.label}</span>
          </div>
        ))}
        {dated.map((s, i) => (
          <span
            key={`${s.signal}${i}`}
            title={`${s.signal} · ${s.date ?? ""} · ${s.evidence}`}
            className="pop-in absolute top-3 size-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow"
            style={{
              left: left(s.age_days ?? 0),
              background: EVIDENCE_COLOR[s.evidence],
              animationDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>12 months ago</span>
        <span className="flex flex-wrap gap-3">
          {(["verified", "partial", "unverified"] as const).map((e) => (
            <span key={e} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: EVIDENCE_COLOR[e] }} />
              {e === "partial" ? "partly supported" : e}
            </span>
          ))}
          {undated > 0 && <span>{undated} undated</span>}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}

/* ── Pipeline progress ──────────────────────────────────────────────────── */

const STAGES = [
  { name: "Research", sub: "Olostep Answers" },
  { name: "Evidence", sub: "Search + Scrape" },
  { name: "Score", sub: "Fit × timing" },
  { name: "Brief", sub: "Cited facts" },
] as const;

function stageIndex(run: Run): number {
  if (!["queued", "processing", "pending", "validating"].includes(run.status)) return STAGES.length;
  const task = run.current?.task ?? "";
  if (/scrape|search|evidence|source/i.test(task)) return 1;
  if (/scor|brief/i.test(task)) return 2;
  if (/answers|research/i.test(task)) return 0;
  return -1;
}

export function PipelineProgress({ run }: { run: Run }) {
  const current = stageIndex(run);
  const finished = current === STAGES.length;
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Pipeline">
      {STAGES.map((s, i) => {
        const done = finished || (current > i && current !== -1);
        const now = current === i || (current === 2 && i === 3);
        return (
          <li key={s.name} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2 ${
                  done || now ? "bg-brand" : "bg-line"
                }`}
                style={{ right: "calc(50% + 18px)", width: "calc(100% - 36px)" }}
              />
            )}
            <span
              className={`relative grid size-8 place-items-center rounded-full border-2 text-xs transition ${
                done
                  ? "border-brand bg-brand text-white"
                  : now
                    ? "border-brand bg-white text-brand"
                    : "border-line bg-white text-faint"
              }`}
            >
              {now && <span className="ping-ring absolute inset-0 rounded-full bg-brand/30" />}
              {done ? <IconCheck className="size-4" /> : i + 1}
            </span>
            <span className={`mt-1.5 text-xs ${done || now ? "text-ink" : "text-muted"}`}>
              {s.name}
            </span>
            <span className="hidden text-[11px] text-faint sm:block">{s.sub}</span>
          </li>
        );
      })}
    </ol>
  );
}
