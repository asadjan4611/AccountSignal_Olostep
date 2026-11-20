import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import multer from "multer";
import { pinoHttp } from "pino-http";
import type { AppContext } from "./controllers/context.js";
import { AppError } from "./lib/errors.js";
import { apiRouter } from "./routes/index.js";

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.disable("x-powered-by");
  if (ctx.config.trustProxy) app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: ctx.config.clientOrigin.split(",").map((o) => o.trim()) }));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      logger: ctx.logger,
      // Progress polling would flood the log.
      autoLogging: {
        ignore: (req) =>
          req.method === "GET" && /^\/api\/(runs|health|connection)/.test(req.url ?? ""),
      },
    }),
  );

  // API responses are live state (progress, credits): never let a browser or proxy cache them.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", apiRouter(ctx));
  app.use("/api", (_req, _res, next) => next(new AppError(404, "not_found", "Route not found")));

  const dir = ctx.config.clientDir;
  if (dir && existsSync(path.join(dir, "index.html"))) {
    app.use(express.static(dir, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.sendFile(path.join(dir, "index.html"));
    });
  }

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json({
        success: false,
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      res.status(tooBig ? 413 : 400).json({
        success: false,
        error: {
          code: err.code.toLowerCase(),
          message: tooBig
            ? `File is too large (max ${Math.round(ctx.config.maxUploadBytes / 1024 / 1024)} MB).`
            : err.message,
        },
      });
      return;
    }
    const type = (err as { type?: string }).type;
    if (type === "entity.parse.failed" || type === "entity.too.large") {
      res.status(type === "entity.too.large" ? 413 : 400).json({
        success: false,
        error: { code: "invalid_body", message: "Request body is invalid or too large." },
      });
      return;
    }
    req.log?.error({ err }, "unhandled error");
    if (res.headersSent) return;
    res
      .status(500)
      .json({ success: false, error: { code: "internal_error", message: "Something went wrong" } });
  };
  app.use(errorHandler);
  return app;
}
