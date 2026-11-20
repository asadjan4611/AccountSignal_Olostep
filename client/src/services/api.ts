import type {
  AccountDetail,
  AccountRow,
  AppConfig,
  ColumnMapping,
  Connection,
  CostEstimate,
  DashboardStats,
  Icp,
  Preview,
  Row,
  Run,
  RunConfig,
} from "../lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when the server couldn't be reached at all (offline, server down, timeout). */
    readonly network = false,
  ) {
    super(message);
  }
}

interface RequestOptions extends RequestInit {
  /** Extra attempts after the first one (network errors, 429 and 5xx only). */
  retries?: number;
  timeoutMs?: number;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Combine the caller's abort signal with a timeout, without relying on AbortSignal.any. */
function withTimeout(signal: AbortSignal | null | undefined, ms: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException("Timed out", "TimeoutError")), ms);
  const onAbort = () => ac.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ac.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ac.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { retries: retriesOpt, timeoutMs = 20_000, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  // Only reads are retried automatically: a write that may have reached the server is not.
  const retries = retriesOpt ?? (method === "GET" ? 2 : 0);
  const isForm = rest.body instanceof FormData;

  for (let attempt = 0; ; attempt++) {
    const t = withTimeout(rest.signal, timeoutMs);
    try {
      const res = await fetch(`/api${path}`, {
        ...rest,
        signal: t.signal,
        headers: isForm ? rest.headers : { "Content-Type": "application/json", ...rest.headers },
      });
      if (res.status === 204) return undefined as T;
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        if (attempt < retries && RETRYABLE.has(res.status)) {
          await wait(400 * 2 ** attempt);
          continue;
        }
        throw new ApiError(
          body?.error?.message ?? `The server returned an error (${res.status}).`,
          res.status,
        );
      }
      return body as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // The caller cancelled: pass the abort through untouched.
      if (rest.signal?.aborted) throw err;
      if (attempt < retries) {
        await wait(400 * 2 ** attempt);
        continue;
      }
      const timedOut = t.signal.aborted;
      throw new ApiError(
        timedOut
          ? "The server took too long to respond. Please try again."
          : "Can't reach the AccountSignal server. Check that it's running, then try again.",
        0,
        true,
      );
    } finally {
      t.done();
    }
  }
}

export const errorMessage = (err: unknown, fallback = "Something went wrong.") =>
  err instanceof Error && err.message ? err.message : fallback;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  config: () => request<AppConfig>("/config"),
  connection: () => request<Connection>("/connection", { timeoutMs: 30_000 }),

  getIcp: () => request<{ icp: Icp | null }>("/icp"),
  saveIcp: (icp: Icp) => request<{ icp: Icp }>("/icp", json("PUT", icp)),

  previewCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Preview>("/csv/preview", { method: "POST", body: form, timeoutMs: 60_000 });
  },
  validateMapping: (uploadId: string, mapping: ColumnMapping) =>
    request<Preview>(`/csv/${uploadId}/validate`, json("POST", { column_mapping: mapping })),

  estimate: (config: RunConfig, signal?: AbortSignal) =>
    request<CostEstimate>("/runs/estimate", { ...json("POST", config), signal, retries: 1 }),
  createRun: (config: RunConfig) => request<{ run_id: string }>("/runs", json("POST", config)),
  runDemo: () => request<{ run_id: string }>("/demo", json("POST")),
  listRuns: () => request<{ stats: DashboardStats; runs: Run[] }>("/runs"),
  getRun: (id: string) => request<Run>(`/runs/${id}`),
  getAccounts: (id: string) =>
    request<{ accounts: AccountRow[]; rows: Row[] }>(`/runs/${id}/accounts`),
  getAccount: (runId: string, companyId: string) =>
    request<AccountDetail>(`/runs/${runId}/accounts/${companyId}`),
  retry: (id: string) => request<Run>(`/runs/${id}/retry`, json("POST")),
  cancel: (id: string) => request<Run>(`/runs/${id}/cancel`, json("POST")),
  remove: (id: string) => request<void>(`/runs/${id}`, json("DELETE")),
  exportUrl: (id: string, format: "csv" | "json") => `/api/runs/${id}/export?format=${format}`,
};

/** The preview is kept for the session so the new-analysis steps survive a refresh. */
export const draftStore = {
  save(preview: Preview) {
    try {
      sessionStorage.setItem(`accountsignal:upload:${preview.upload_id}`, JSON.stringify(preview));
    } catch {
      // Storage disabled: the flow still works within this page.
    }
  },
  load(uploadId: string): Preview | null {
    try {
      const raw = sessionStorage.getItem(`accountsignal:upload:${uploadId}`);
      return raw ? (JSON.parse(raw) as Preview) : null;
    } catch {
      return null;
    }
  },
  clear(uploadId: string) {
    try {
      sessionStorage.removeItem(`accountsignal:upload:${uploadId}`);
    } catch {
      // ignore
    }
  },
};
