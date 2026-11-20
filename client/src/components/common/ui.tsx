import type { ComponentProps, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { IconAlert, IconCheckCircle, IconInfo, IconXCircle } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-(--shadow-button) hover:bg-brand-hover active:translate-y-px",
  secondary:
    "border border-line bg-white text-ink hover:border-line-strong hover:bg-bg-soft active:translate-y-px",
  ghost: "text-ink-2 hover:bg-seg hover:text-ink",
  danger: "border border-line bg-white text-bad hover:border-bad/40 hover:bg-bad-soft",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-[15px]",
};
export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Class string for anything that should look like a button (links included). */
export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = ""): string {
  return `inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  download,
  variant = "secondary",
  size = "md",
  icon,
  onClick,
}: {
  href: string;
  children: ReactNode;
  download?: boolean;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <a href={href} download={download} onClick={onClick} className={buttonClass(variant, size)}>
      {icon}
      {children}
    </a>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-line bg-white shadow-(--shadow-card) ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  sub,
  icon,
  action,
}: {
  title: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Olostep's "browser window" frame with traffic-light dots. */
export function WindowCard({
  children,
  title,
  className = "",
}: {
  children: ReactNode;
  title?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-line bg-white shadow-(--shadow-pop) ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-line bg-bg-soft px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </span>
        {title && <span className="truncate text-[13px] text-muted">{title}</span>}
      </div>
      {children}
    </section>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/** Olostep-style segmented control: grey track, white active pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-[10px] bg-seg p-1 [scrollbar-width:none] ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-sm whitespace-nowrap transition ${FOCUS} disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? "bg-white text-ink shadow-(--shadow-seg)" : "text-ink-2 hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Page-level view switcher (underline tabs). */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-2 border-b-2 pb-2.5 text-[15px] whitespace-nowrap transition ${FOCUS} ${
              active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const ALERT = {
  info: { cls: "border-brand/20 bg-brand-soft", icon: <IconInfo className="size-4 text-brand" /> },
  warn: { cls: "border-warn/25 bg-warn-soft", icon: <IconAlert className="size-4 text-warn" /> },
  bad: { cls: "border-bad/25 bg-bad-soft", icon: <IconXCircle className="size-4 text-bad" /> },
  good: {
    cls: "border-good/25 bg-good-soft",
    icon: <IconCheckCircle className="size-4 text-good" />,
  },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: keyof typeof ALERT;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const a = ALERT[tone];
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={`flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed text-ink ${a.cls}`}
    >
      <span className="mt-0.5 shrink-0">{a.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-ink">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-ink-2" : ""}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

const BADGE = {
  neutral: "bg-seg text-ink-2",
  brand: "bg-brand-soft text-brand",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className = "",
  dot = false,
}: {
  tone?: keyof typeof BADGE;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${BADGE[tone]} ${className}`}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

const fieldClass =
  "w-full rounded-[10px] border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-faint transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15";

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${className}`} />;
}

export function TextArea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${fieldClass} min-h-24 resize-y leading-relaxed ${className}`}
    />
  );
}

export function SelectInput({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${fieldClass} pr-8 ${className}`} />;
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm text-ink">
      {children}
      {hint && <span className="ml-1.5 text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "text-ink",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white px-4 py-3.5 shadow-(--shadow-card)">
      <dt className="flex items-center gap-2 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className={`mt-1.5 truncate font-display text-2xl tabular-nums ${tone}`}>{value}</dd>
      {hint && <dd className="mt-0.5 truncate text-xs text-muted">{hint}</dd>}
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-xl tracking-tight text-ink">{children}</h2>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Accessible on/off switch with a label and an optional description. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition ${FOCUS} ${
          checked ? "bg-brand" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
      <span className="text-sm">
        <span className="text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-white px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
        {icon}
      </span>
      <p className="mt-4 text-[15px] text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Small "?" with a hover/focus explanation. */
export function HelpTip({
  children,
  label = "More info",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className={`grid size-4 place-items-center rounded-full text-faint hover:text-ink ${FOCUS}`}
      >
        <IconInfo className="size-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-(--shadow-pop) transition group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
