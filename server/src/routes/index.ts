import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import type { AppContext } from "../controllers/context.js";
import { csvController } from "../controllers/csv.controller.js";
import { runsController } from "../controllers/enrichment.controller.js";

const limiter = (limit: number) =>
  rateLimit({ windowMs: 60_000, limit, standardHeaders: "draft-8", legacyHeaders: false });

export function apiRouter(ctx: AppContext): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: ctx.config.maxUploadBytes, files: 1 },
  });
  const csv = csvController(ctx);
  const runs = runsController(ctx);

  router.get("/health", (_req, res) => res.json({ ok: true }));
  router.get("/config", (_req, res) =>
    res.json({
      live_configured: ctx.config.liveConfigured,
      usd_per_credit: ctx.config.usdPerCredit,
      max_rows: ctx.config.maxRows,
      max_upload_mb: ctx.config.maxUploadBytes / 1024 / 1024,
    }),
  );
  router.get("/connection", limiter(30), runs.connection);

  router.get("/icp", runs.getIcp);
  router.put("/icp", limiter(60), runs.putIcp);

  router.post("/csv/preview", limiter(30), upload.single("file"), csv.preview);
  router.post("/csv/:uploadId/validate", limiter(120), csv.validate);

  router.post("/runs/estimate", limiter(120), runs.estimate);
  router.post("/runs", limiter(10), runs.create);
  router.post("/demo", limiter(10), runs.demo);
  router.get("/runs", runs.list);
  router.get("/runs/:id", runs.get);
  router.get("/runs/:id/accounts", runs.accounts);
  router.get("/runs/:id/accounts/:companyId", runs.account);
  router.get("/runs/:id/export", runs.export);
  router.post("/runs/:id/retry", limiter(20), runs.retry);
  router.post("/runs/:id/cancel", runs.cancel);
  router.delete("/runs/:id", runs.remove);
  return router;
}
