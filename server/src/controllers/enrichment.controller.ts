import type { Request, Response } from "express";
import { errorMessage, notFound, serviceUnavailable } from "../lib/errors.js";
import { parseBody } from "../lib/validate.js";
import { exportCsv, exportJson } from "../services/export.service.js";
import { ACTIVE_STATUSES } from "../store/types.js";
import { IcpSchema, RunConfigSchema } from "../validators/job.schema.js";
import type { AppContext } from "./context.js";
import {
  accountDetailDto,
  accountRowDto,
  icpDto,
  leadDto,
  runDto,
  sortAccounts,
} from "./serializers.js";

export function runsController(ctx: AppContext) {
  const { store, service, config } = ctx;
  const id = (req: Request) => String(req.params.id);
  const dto = (runId: string) => {
    const job = service.getJob(runId);
    return runDto(job, store.getLeads(job.id), config.usdPerCredit);
  };

  return {
    /** GET /api/connection: is the Olostep key valid, and how many credits are left? (free) */
    async connection(_req: Request, res: Response) {
      if (!ctx.checkCredits) {
        res.json({
          configured: false,
          ok: false,
          demo_available: true,
          message: "No OLOSTEP_API_KEY set: demo mode only.",
        });
        return;
      }
      try {
        const info = await ctx.checkCredits();
        res.json({
          configured: true,
          ok: info.allowUsage,
          credits: info.credits,
          plan: info.plan,
          demo_available: true,
          message: info.allowUsage
            ? "Connected to Olostep."
            : "Connected, but usage is not allowed on this account.",
        });
      } catch (err) {
        res.json({ configured: true, ok: false, demo_available: true, message: errorMessage(err) });
      }
    },

    /** GET /api/icp, PUT /api/icp: stage 1, the saved ideal customer profile. */
    getIcp(_req: Request, res: Response) {
      res.json({ icp: icpDto(service.getIcp()) });
    },
    putIcp(req: Request, res: Response) {
      res.json({ icp: icpDto(service.saveIcp(parseBody(IcpSchema, req.body))) });
    },

    /** POST /api/runs/estimate: credits and USD before anything is spent. */
    estimate(req: Request, res: Response) {
      res.json(service.estimate(parseBody(RunConfigSchema, req.body)));
    },

    /** POST /api/runs */
    create(req: Request, res: Response) {
      if (!config.liveConfigured) {
        throw serviceUnavailable(
          "missing_api_key",
          "Set OLOSTEP_API_KEY in .env and restart the server to analyse real companies. The demo works without a key.",
        );
      }
      const job = service.createRun(parseBody(RunConfigSchema, req.body));
      res.status(202).json({
        success: true,
        run_id: job.id,
        status: job.status,
        total_rows: store.getLeads(job.id).length,
        total_companies: job.tasks.length,
      });
    },

    /** POST /api/demo: run the bundled demo (fictional companies, no key, no credits). */
    demo(_req: Request, res: Response) {
      const job = service.createDemoRun();
      res.status(202).json({
        success: true,
        run_id: job.id,
        status: job.status,
        total_companies: job.tasks.length,
      });
    },

    /** GET /api/runs: history and dashboard totals. */
    list(_req: Request, res: Response) {
      const jobs = store.listJobs();
      const runs = jobs.map((j) => runDto(j, store.getLeads(j.id), config.usdPerCredit));
      res.json({
        stats: {
          accounts: runs.reduce((n, r) => n + r.progress.completed, 0),
          act_now: runs.reduce((n, r) => n + r.priorities.act_now, 0),
          verified_signals: runs.reduce((n, r) => n + r.signals.verified, 0),
          active_runs: jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length,
          credits_used: runs.reduce((n, r) => n + r.credits_used, 0),
        },
        runs,
      });
    },

    /** GET /api/runs/:id: details and live progress (poll this). */
    get(req: Request, res: Response) {
      res.json(dto(id(req)));
    },

    /** GET /api/runs/:id/accounts: accounts ranked by priority, plus the original rows. */
    accounts(req: Request, res: Response) {
      const job = service.getJob(id(req));
      res.json({
        accounts: sortAccounts(
          job.tasks.map((t) =>
            accountRowDto(t, t.companyId ? store.getCompany(t.companyId) : undefined),
          ),
        ),
        rows: store.getLeads(job.id).map(leadDto),
      });
    },

    /** GET /api/runs/:id/accounts/:companyId: the full account brief. */
    account(req: Request, res: Response) {
      const job = service.getJob(id(req));
      const companyId = String(req.params.companyId);
      const task = job.tasks.find((t) => t.companyId === companyId);
      const company = store.getCompany(companyId);
      if (!task || !company) throw notFound("Account");
      const contacts = store.getLeads(job.id).filter((l) => task.leadIds.includes(l.id));
      res.json(accountDetailDto(job, task, company, contacts));
    },

    /** GET /api/runs/:id/export?format=csv|json */
    export(req: Request, res: Response) {
      const job = service.getJob(id(req));
      const base = job.filename.replace(/\.csv$/i, "").replace(/[^\w.-]+/g, "_") || "accounts";
      if (req.query.format === "json") {
        res.setHeader("Content-Disposition", `attachment; filename="${base}-prioritised.json"`);
        res.json(exportJson(job, store));
        return;
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${base}-prioritised.csv"`);
      res.send(`\uFEFF${exportCsv(job, store)}`);
    },

    retry(req: Request, res: Response) {
      service.retry(id(req));
      res.json(dto(id(req)));
    },

    async cancel(req: Request, res: Response) {
      await service.cancel(id(req));
      res.json(dto(id(req)));
    },

    async remove(req: Request, res: Response) {
      await service.delete(id(req));
      res.status(204).end();
    },
  };
}
