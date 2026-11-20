import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useConnection } from "../../hooks/useConnection";
import { formatCount } from "../../lib/format";
import { IconGithub, IconPlus, IconSignal } from "./icons";
import { buttonClass, FOCUS } from "./ui";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm transition ${FOCUS} ${isActive ? "bg-seg text-ink" : "text-ink-2 hover:bg-seg hover:text-ink"}`;

function ConnectionPill() {
  const { connection, checking } = useConnection();
  if (!connection && !checking) return null;
  const state =
    checking && !connection
      ? { dot: "bg-faint animate-pulse-dot", text: "Checking key…" }
      : connection?.ok
        ? { dot: "bg-good", text: `${formatCount(connection.credits ?? 0)} credits` }
        : connection?.configured
          ? { dot: "bg-bad", text: "Key problem" }
          : { dot: "bg-watch", text: "Demo mode" };
  return (
    <Link
      to="/#connection"
      title={connection?.message}
      className={`hidden items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-2 transition hover:border-line-strong md:inline-flex ${FOCUS}`}
    >
      <span className={`size-2 rounded-full ${state.dot}`} aria-hidden="true" />
      {state.text}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass sticky top-0 z-30 border-b border-line/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className={`flex items-center gap-2 rounded-md ${FOCUS}`}>
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-white shadow-(--shadow-button)">
              <IconSignal className="size-4" />
            </span>
            <span className="font-serif text-[21px] leading-none tracking-tight text-ink">
              AccountSignal
            </span>
            <span className="hidden text-xs text-muted lg:inline">on Olostep</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `hidden sm:inline-flex ${navClass({ isActive })}`}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/icp"
              className={({ isActive }) => `hidden sm:inline-flex ${navClass({ isActive })}`}
            >
              Ideal customer
            </NavLink>
            <ConnectionPill />
            <Link to="/icp?next=upload" className={buttonClass("primary", "sm")}>
              <IconPlus className="size-3.5" />
              <span className="hidden min-[400px]:inline">New analysis</span>
              <span className="min-[400px]:hidden">New</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <span className="flex items-center gap-2">
            <IconSignal className="size-3.5 text-brand" />
            Research by Olostep (Answers, Search, Scrape) · decisions by your own rules · MIT
          </span>
          <span className="flex items-center gap-3">
            Buying signals suggest opportunities, not proof of intent.
            <a
              href="https://github.com/asadjan4611/accountsignal"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Source on GitHub"
              className="text-muted hover:text-ink"
            >
              <IconGithub className="size-4" />
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function Page({
  title,
  eyebrow,
  sub,
  actions,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="animate-in mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="text-xs tracking-wide text-muted uppercase">{eyebrow}</div>}
          <h1 className="mt-1 font-display text-[28px] leading-tight tracking-tight break-words text-ink sm:text-[32px]">
            {title}
          </h1>
          {sub && <div className="mt-2 text-[15px] text-muted">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Full-page loading placeholder. */
export function PageSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="skeleton h-4 w-32" />
      <div className="skeleton h-9 w-72 max-w-full" />
      <div className="grid gap-3 pt-4 sm:grid-cols-3">
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
      </div>
      <div className="skeleton h-64" />
    </div>
  );
}
