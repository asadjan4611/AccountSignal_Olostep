import type { EvidenceStatus, FieldStatus, Priority, RunStatus } from "../../lib/types";
import { Badge } from "./ui";

const RUN: Record<
  RunStatus,
  { label: string; tone: "neutral" | "brand" | "good" | "warn" | "bad" }
> = {
  pending: { label: "Pending", tone: "neutral" },
  validating: { label: "Validating", tone: "brand" },
  queued: { label: "Queued", tone: "brand" },
  processing: { label: "Analysing", tone: "brand" },
  completed: { label: "Completed", tone: "good" },
  completed_with_errors: { label: "Completed with errors", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const s = RUN[status];
  const live = status === "processing" || status === "queued";
  return (
    <Badge tone={s.tone}>
      <span
        className={`size-1.5 rounded-full bg-current ${live ? "animate-pulse-dot" : ""}`}
        aria-hidden="true"
      />
      {s.label}
    </Badge>
  );
}

export const PRIORITY_STYLE: Record<Priority, { cls: string; hint: string }> = {
  "Act now": { cls: "bg-act text-white", hint: "Strong ICP fit and fresh, evidenced signals" },
  Nurture: {
    cls: "bg-nurture-soft text-nurture",
    hint: "Strong fit, few recent signals: keep warm",
  },
  Watch: { cls: "bg-watch-soft text-watch", hint: "Active now, but a weaker fit" },
  Skip: { cls: "bg-skip-soft text-ink-2", hint: "Weak fit and little recent activity" },
};

export function PriorityBadge({
  priority,
  large = false,
}: {
  priority: Priority;
  large?: boolean;
}) {
  const p = PRIORITY_STYLE[priority];
  return (
    <span
      title={p.hint}
      className={`inline-flex items-center gap-1.5 rounded-full whitespace-nowrap ${large ? "px-3.5 py-1 text-sm" : "px-2.5 py-0.5 text-xs"} ${p.cls}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {priority}
    </span>
  );
}

const EVIDENCE: Record<EvidenceStatus, { label: string; tone: "good" | "warn" | "neutral" }> = {
  verified: { label: "Verified", tone: "good" },
  partial: { label: "Partly supported", tone: "warn" },
  unverified: { label: "Unverified", tone: "neutral" },
};

export function EvidenceBadge({ status, note }: { status: EvidenceStatus; note?: string }) {
  const e = EVIDENCE[status];
  return (
    <span title={note}>
      <Badge tone={e.tone}>{e.label}</Badge>
    </span>
  );
}

const FIELD: Record<
  FieldStatus,
  { label: string; tone: "good" | "warn" | "neutral" | "brand"; hint: string }
> = {
  verified: { label: "Verified", tone: "good", hint: "Reported by a source that this field cites" },
  estimated: { label: "Estimated", tone: "warn", hint: "An estimate, not a reported figure" },
  unverified: {
    label: "Unverified",
    tone: "brand",
    hint: "Reported, without a field-level citation",
  },
  unavailable: { label: "Unavailable", tone: "neutral", hint: "Could not be verified (NOT_FOUND)" },
};

export function FieldStatusBadge({ status }: { status: FieldStatus }) {
  const s = FIELD[status];
  return (
    <span title={s.hint}>
      <Badge tone={s.tone}>{s.label}</Badge>
    </span>
  );
}

/** A compact 0-100 meter used for ICP fit and timing. */
export function ScoreBar({ score, label }: { score: number; label: string }) {
  const tone =
    score >= 75
      ? "bg-good"
      : score >= 50
        ? "bg-brand"
        : score >= 25
          ? "bg-watch"
          : "bg-line-strong";
  return (
    <span className="flex min-w-24 items-center gap-2" title={`${label}: ${score}/100`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-seg" aria-hidden="true">
        <span
          className={`block h-full rounded-full transition-[width] duration-700 ${tone}`}
          style={{ width: `${Math.max(3, score)}%` }}
        />
      </span>
      <span className="text-sm text-ink tabular-nums">{score}</span>
    </span>
  );
}
