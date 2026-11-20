import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { IconAlert, IconCheckCircle, IconInfo, IconX, IconXCircle } from "./icons";
import { Button } from "./ui";

/* ── Toasts ─────────────────────────────────────────────────────────────── */

type ToastTone = "good" | "bad" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  text: ReactNode;
}
type Notify = (text: ReactNode, tone?: ToastTone) => void;

const ToastContext = createContext<Notify>(() => undefined);

export const useToast = () => useContext(ToastContext);

const TOAST_ICON: Record<ToastTone, ReactNode> = {
  good: <IconCheckCircle className="size-4 text-good" />,
  bad: <IconXCircle className="size-4 text-bad" />,
  info: <IconInfo className="size-4 text-brand" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notify = useCallback<Notify>(
    (text, tone = "good") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, tone, text }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "bad" ? 7_000 : 4_000),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "bad" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink shadow-(--shadow-pop)"
          >
            <span className="mt-0.5 shrink-0">{TOAST_ICON[t.tone]}</span>
            <span className="min-w-0 flex-1 leading-relaxed">{t.text}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded text-faint hover:text-ink"
            >
              <IconX className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ── Confirm dialog ─────────────────────────────────────────────────────── */

interface ConfirmOptions {
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(
    null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);

  const confirm = useCallback<Confirm>(
    (options) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (state && !dialog.open) dialog.showModal();
    if (!state && dialog.open) dialog.close();
  }, [state]);

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close(false);
        }}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line bg-white p-0 text-ink shadow-(--shadow-pop) backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
      >
        {state && (
          <div className="pop-in p-6">
            <div className="flex items-start gap-3">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full ${
                  state.danger ? "bg-bad-soft text-bad" : "bg-brand-soft text-brand"
                }`}
              >
                {state.danger ? <IconAlert className="size-4" /> : <IconInfo className="size-4" />}
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] text-ink">{state.title}</h2>
                {state.body && (
                  <div className="mt-1 text-sm leading-relaxed text-muted">{state.body}</div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => close(false)} autoFocus>
                Keep it
              </Button>
              <Button
                variant={state.danger ? "danger" : "primary"}
                className={state.danger ? "border-bad! bg-bad! text-white! hover:opacity-90" : ""}
                onClick={() => close(true)}
              >
                {state.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

/* ── Error boundary ─────────────────────────────────────────────────────── */

interface BoundaryProps {
  children: ReactNode;
  /** Changing this (e.g. the route) clears the error. */
  resetKey?: string;
}

export class ErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error", error, info.componentStack);
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-bad-soft text-bad">
          <IconAlert className="size-5" />
        </span>
        <h1 className="mt-4 font-display text-2xl text-ink">This screen hit a problem</h1>
        <p className="mt-2 text-sm text-muted">
          Your data is safe on the server. Try again, or go back to the dashboard.
        </p>
        <p className="mt-3 font-mono text-xs break-words text-faint">{this.state.error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button onClick={() => window.location.assign("/")}>Dashboard</Button>
        </div>
      </div>
    );
  }
}
