import type { AccountBrief, IcpResult, Priority, Signal, TimingResult } from "../store/types.js";

/**
 * Stage 7: the account brief. Built from a template using only researched, cited facts,
 * so it can't invent anything. Signals are reasons to look closer, never proof of intent.
 */

function describeSignal(s: Signal): string {
  const when = s.date ? ` (${s.date})` : " (undated)";
  const proof =
    s.evidence === "verified"
      ? "verified"
      : s.evidence === "partial"
        ? "partly supported"
        : "unverified";
  return `${s.signal}${when}: ${proof}`;
}

export function buildBrief(input: {
  companyName: string;
  fit: IcpResult;
  timing: TimingResult;
  priority: Priority;
  signals: readonly Signal[];
}): AccountBrief {
  const { fit, timing, priority, signals } = input;
  const matched = fit.checks.filter((c) => c.outcome === "matched");
  const missed = fit.checks.filter((c) => c.outcome === "missed");
  const unknown = fit.checks.filter((c) => c.outcome === "unknown");
  const counted = signals.filter((s) => s.points > 0).sort((a, b) => b.points - a.points);
  const top = counted[0];

  const summary: Record<Priority, string> = {
    "Act now": `${input.companyName} matches your ICP (${fit.score}/100) and shows recent activity (${timing.score}/100). A good account to approach now.`,
    Nurture: `${input.companyName} matches your ICP (${fit.score}/100) but has few recent signals (${timing.score}/100). Keep it warm and re-check later.`,
    Watch: `${input.companyName} is active right now (${timing.score}/100) but is a weaker ICP match (${fit.score}/100). Check whether the gaps rule it out.`,
    Skip: `${input.companyName} is a weak ICP match (${fit.score}/100) with little recent activity (${timing.score}/100).`,
  };

  const next: string[] = [];
  if (priority === "Act now" && top) {
    next.push(
      `Open with the most recent signal: "${top.signal}"${top.date ? ` (${top.date})` : ""}.`,
    );
  }
  if (counted.some((s) => s.type === "hiring")) {
    next.push("Look at their open roles to find the team that would use your product.");
  }
  if (counted.some((s) => s.type === "funding")) {
    next.push("New funding often comes with new budgets: find out who owns the decision.");
  }
  for (const c of unknown.slice(0, 3)) {
    next.push(`Confirm ${c.label.toLowerCase()}: no reliable data was found.`);
  }
  for (const s of signals.filter((x) => x.points > 0 && x.evidence !== "verified").slice(0, 2)) {
    next.push(`Double-check "${s.signal}": ${s.evidenceNote.toLowerCase()}.`);
  }
  if (priority === "Nurture")
    next.push("No strong recent signals: re-check this account in about 30 days.");
  if (priority === "Watch")
    next.push(
      "Recent activity but a weaker fit: check whether the missed criteria really rule it out.",
    );
  if (priority === "Skip") next.push("Low fit and little recent activity: deprioritise for now.");

  return {
    summary: summary[priority],
    whyFit: matched.map((c) => (c.value ? `${c.label} · ${c.value}` : c.label)),
    whyNow: counted.slice(0, 4).map(describeSignal),
    gaps: [
      ...missed.map((c) => (c.value ? `${c.label} · found "${c.value}"` : c.label)),
      ...unknown.map((c) => `${c.label} · unknown`),
    ],
    next: [...new Set(next)].slice(0, 6),
  };
}
