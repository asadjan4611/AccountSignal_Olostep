/** An error that maps cleanly onto an HTTP response. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "bad_request", message, details);

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found`);

export const conflict = (message: string) => new AppError(409, "conflict", message);

export const serviceUnavailable = (code: string, message: string) =>
  new AppError(503, code, message);

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}
