import type { z } from "zod";
import { badRequest } from "./errors.js";

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const first = issues[0];
    throw badRequest(
      first ? `${first.path ? `${first.path}: ` : ""}${first.message}` : "Invalid request body",
      issues,
    );
  }
  return parsed.data;
}
