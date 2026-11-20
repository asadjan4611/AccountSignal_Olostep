import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useToast } from "../components/common/feedback";
import {
  IconArrowRight,
  IconBuilding,
  IconCheck,
  IconCoins,
  IconGlobe,
  IconLayers,
  IconSparkles,
  IconTarget,
  IconUsers,
  IconX,
} from "../components/common/icons";
import { Page, PageSkeleton } from "../components/common/Layout";
import { Steps } from "../components/common/Steps";
import { Alert, Button, Card, CardHeader, FOCUS, Switch, TextInput } from "../components/common/ui";
import { PRIORITY_COLOR } from "../components/visuals";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import type { Icp } from "../lib/types";
import { api, errorMessage } from "../services/api";

const EXAMPLE: Icp = {
  industries: ["SaaS"],
  locations: ["United States", "USA"],
  min_employees: 100,
  max_employees: 2000,
  technologies: ["AWS", "Kubernetes"],
  funding_stages: ["Series A", "Series B", "Series C"],
  min_funding_usd: null,
  must_be_hiring: false,
};

const EMPTY: Icp = {
  industries: [],
  locations: [],
  min_employees: null,
  max_employees: null,
  technologies: [],
  funding_stages: [],
  min_funding_usd: null,
  must_be_hiring: false,
};

const SUGGEST = {
  industries: [
    "SaaS",
    "Fintech",
    "Developer tools",
    "Healthcare",
    "E-commerce",
    "AI",
    "Cybersecurity",
  ],
  locations: ["United States", "USA", "United Kingdom", "Germany", "Canada", "Europe"],
  technologies: ["AWS", "Google Cloud", "Azure", "Kubernetes", "Snowflake", "Salesforce", "Python"],
};
const STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Public"];
const SIZES: { label: string; min: number | null; max: number | null }[] = [
  { label: "1–50", min: 1, max: 50 },
  { label: "50–200", min: 50, max: 200 },
  { label: "100–2,000", min: 100, max: 2000 },
  { label: "1,000+", min: 1000, max: null },
];

function TagInput({
  id,
  values,
  onChange,
  placeholder,
  suggestions = [],
}: {
  id: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !values.some((v) => v.toLowerCase() === p.toLowerCase()));
    if (parts.length) onChange([...values, ...parts]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  const unused = suggestions.filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()),
  );
  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-[10px] border border-line bg-white px-2 py-1.5 transition focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15 hover:border-line-strong">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pr-1 pl-2.5 text-[13px] text-brand-ink"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className={`grid size-4 place-items-center rounded-full hover:bg-brand/15 ${FOCUS}`}
            >
              <IconX className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={values.length ? "Add more…" : placeholder}
          className="min-w-28 flex-1 bg-transparent px-1 py-1 text-sm text-ink placeholder:text-faint focus:outline-none"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unused.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...values, s])}
              className={`rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs text-muted transition hover:border-brand hover:text-brand ${FOCUS}`}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition ${FOCUS} ${
        on
          ? "border-brand bg-brand text-white shadow-(--shadow-button)"
          : "border-line bg-white text-ink-2 hover:border-line-strong"
      }`}
    >
      {on && <IconCheck className="size-3.5" />}
      {children}
    </button>
  );
}

function Field({
  icon,
  label,
  hint,
  htmlFor,
  children,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-line px-5 py-5 first:border-t-0 sm:px-6">
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm text-ink">
        <span className="text-brand">{icon}</span>
        {label}
        {hint && <span className="text-muted">· {hint}</span>}
      </label>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

const toNum = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function summary(icp: Icp): string {
  const parts: string[] = [];
  if (icp.industries.length) parts.push(icp.industries.join(" or "));
  parts.push("companies");
  if (icp.locations.length) parts.push(`in ${icp.locations.join(" / ")}`);
  if (icp.min_employees !== null || icp.max_employees !== null)
    parts.push(
      `with ${icp.min_employees ?? 1}${icp.max_employees === null ? "+" : `–${icp.max_employees.toLocaleString()}`} employees`,
    );
  if (icp.technologies.length) parts.push(`using ${icp.technologies.join(" or ")}`);
  if (icp.funding_stages.length) parts.push(`at ${icp.funding_stages.join(", ")}`);
  if (icp.min_funding_usd) parts.push(`with ≥ $${icp.min_funding_usd / 1_000_000}M raised`);
  if (icp.must_be_hiring) parts.push("that are hiring");
  return parts.join(" ");
}

function criteriaCount(icp: Icp): number {
  return [
    icp.industries.length,
    icp.locations.length,
    icp.min_employees !== null || icp.max_employees !== null,
    icp.technologies.length,
    icp.funding_stages.length,
    icp.min_funding_usd !== null,
    icp.must_be_hiring,
  ].filter(Boolean).length;
}

export function IcpPage() {
  useDocumentTitle("Ideal customer");
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const continueToUpload = params.get("next") === "upload";
  const [icp, setIcp] = useState<Icp | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getIcp()
      .then((r) => setIcp(r.icp ?? { ...EXAMPLE }))
      .catch((err: unknown) => {
        setIcp({ ...EXAMPLE });
        setLoadNote(
          `Couldn't load your saved profile (${errorMessage(err)}). Showing the example.`,
        );
      });
  }, []);

  const count = useMemo(() => (icp ? criteriaCount(icp) : 0), [icp]);
  const sizeError =
    icp &&
    icp.min_employees !== null &&
    icp.max_employees !== null &&
    icp.min_employees > icp.max_employees
      ? "Min employees is larger than max."
      : null;

  if (!icp) return <PageSkeleton />;
  const set = (patch: Partial<Icp>) => setIcp({ ...icp, ...patch });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!icp || sizeError) return;
    if (count === 0) {
      setError("Add at least one criterion, otherwise every account scores the same.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.saveIcp(icp);
      toast("Ideal customer profile saved");
      if (continueToUpload) navigate("/new");
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      eyebrow={continueToUpload ? "New analysis" : "Settings"}
      title="Define your ideal customer"
      sub={
        continueToUpload ? <Steps current={0} /> : "Every account is scored against this profile."
      }
    >
      <form onSubmit={(e) => void save(e)} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {loadNote && <Alert tone="warn">{loadNote}</Alert>}
          <Card>
            <CardHeader
              icon={<IconTarget className="size-4" />}
              title="Profile"
              sub="Fill in only what matters. Empty criteria are ignored."
              action={
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<IconSparkles className="size-3.5" />}
                    onClick={() => setIcp({ ...EXAMPLE })}
                  >
                    Example
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIcp({ ...EMPTY })}>
                    Clear
                  </Button>
                </div>
              }
            />
            <Field
              icon={<IconBuilding className="size-4" />}
              label="Industries"
              hint="any of these"
              htmlFor="icp-ind"
            >
              <TagInput
                id="icp-ind"
                values={icp.industries}
                onChange={(v) => set({ industries: v })}
                placeholder="SaaS, Fintech…"
                suggestions={SUGGEST.industries}
              />
            </Field>
            <Field
              icon={<IconGlobe className="size-4" />}
              label="Locations"
              hint="matched against headquarters"
              htmlFor="icp-loc"
            >
              <TagInput
                id="icp-loc"
                values={icp.locations}
                onChange={(v) => set({ locations: v })}
                placeholder="United States…"
                suggestions={SUGGEST.locations}
              />
            </Field>
            <Field icon={<IconUsers className="size-4" />} label="Employees">
              <div className="flex flex-wrap gap-1.5">
                {SIZES.map((s) => (
                  <Chip
                    key={s.label}
                    on={icp.min_employees === s.min && icp.max_employees === s.max}
                    onClick={() => set({ min_employees: s.min, max_employees: s.max })}
                  >
                    {s.label}
                  </Chip>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <TextInput
                  aria-label="Min employees"
                  inputMode="numeric"
                  placeholder="Min"
                  value={icp.min_employees ?? ""}
                  onChange={(e) => set({ min_employees: toNum(e.target.value) })}
                  className="max-w-32"
                />
                <span className="text-muted">to</span>
                <TextInput
                  aria-label="Max employees"
                  inputMode="numeric"
                  placeholder="Max"
                  value={icp.max_employees ?? ""}
                  onChange={(e) => set({ max_employees: toNum(e.target.value) })}
                  className="max-w-32"
                />
              </div>
              {sizeError && <p className="mt-1.5 text-xs text-bad">{sizeError}</p>}
            </Field>
            <Field
              icon={<IconLayers className="size-4" />}
              label="Technologies"
              hint="any of these in their stack"
              htmlFor="icp-tech"
            >
              <TagInput
                id="icp-tech"
                values={icp.technologies}
                onChange={(v) => set({ technologies: v })}
                placeholder="AWS, Kubernetes…"
                suggestions={SUGGEST.technologies}
              />
            </Field>
            <Field icon={<IconCoins className="size-4" />} label="Funding">
              <div className="flex flex-wrap gap-1.5">
                {[...STAGES, ...icp.funding_stages.filter((s) => !STAGES.includes(s))].map((s) => {
                  const on = icp.funding_stages.includes(s);
                  return (
                    <Chip
                      key={s}
                      on={on}
                      onClick={() =>
                        set({
                          funding_stages: on
                            ? icp.funding_stages.filter((x) => x !== s)
                            : [...icp.funding_stages, s],
                        })
                      }
                    >
                      {s}
                    </Chip>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                At least $
                <TextInput
                  aria-label="Minimum total funding in millions of US dollars"
                  inputMode="decimal"
                  placeholder="—"
                  value={icp.min_funding_usd === null ? "" : icp.min_funding_usd / 1_000_000}
                  onChange={(e) => {
                    const n = toNum(e.target.value);
                    set({ min_funding_usd: n === null ? null : n * 1_000_000 });
                  }}
                  className="max-w-24"
                />
                M raised (optional)
              </div>
            </Field>
            <Field icon={<IconUsers className="size-4" />} label="Hiring">
              <Switch
                checked={icp.must_be_hiring}
                onChange={(v) => set({ must_be_hiring: v })}
                label="Must be hiring"
                description="Counts as a criterion: open roles found in research."
              />
            </Field>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <div className="sky px-5 py-4">
              <p className="text-xs text-muted">You're looking for</p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink">
                {count ? (
                  summary(icp)
                ) : (
                  <span className="text-muted">Any company (add criteria)</span>
                )}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-muted">
                <span className="text-ink tabular-nums">{count}</span> criteri
                {count === 1 ? "on" : "a"} · each account is{" "}
                <span className="text-good">matched</span>, <span className="text-bad">missed</span>{" "}
                or <span className="text-ink-2">unknown</span> on every one. Unknown never counts as
                a match.
              </p>
              {error && (
                <div className="mt-3">
                  <Alert tone="bad">{error}</Alert>
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                className="mt-4 w-full"
                loading={saving}
                disabled={Boolean(sizeError)}
                icon={continueToUpload ? undefined : <IconCheck className="size-4" />}
              >
                {continueToUpload ? "Save and continue" : "Save profile"}
                {continueToUpload && <IconArrowRight className="size-4" />}
              </Button>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-[15px] text-ink">How priority is decided</h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              {(
                [
                  ["Act now", "fit ≥ 60 and timing ≥ 50"],
                  ["Nurture", "good fit, few recent signals"],
                  ["Watch", "active now, weaker fit"],
                  ["Skip", "neither"],
                ] as const
              ).map(([p, d]) => (
                <li key={p} className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: PRIORITY_COLOR[p].fg }}
                  />
                  <span className="text-ink">{p}</span>
                  <span className="text-muted">{d}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </form>
    </Page>
  );
}
