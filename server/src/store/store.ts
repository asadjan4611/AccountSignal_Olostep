import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../lib/logger.js";
import type { CompanyProfile, EnrichmentJob, IcpCriteria, LeadRecord, Upload } from "./types.js";

export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;

const UPLOAD_TTL_MS = 60 * 60 * 1000;
const MAX_UPLOADS = 50;

interface Snapshot {
  version: 1;
  jobs: EnrichmentJob[];
  leads: Record<string, LeadRecord[]>;
  companies: CompanyProfile[];
  icp?: IcpCriteria | null;
}

/**
 * In-memory store with an optional JSON snapshot on disk, so jobs survive restarts
 * without a database server. Writes are debounced and atomic (temp file + rename).
 * Uploaded CSVs stay in memory only and expire after an hour.
 */
export class Store {
  private readonly uploads = new Map<string, Upload>();
  private readonly jobs = new Map<string, EnrichmentJob>();
  private readonly leads = new Map<string, LeadRecord[]>();
  private readonly companies = new Map<string, CompanyProfile>();
  private readonly cacheIndex = new Map<string, string>();
  private icp: IcpCriteria | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string | null,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<void> {
    if (!this.file) return;
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch {
      return; // First run: nothing saved yet.
    }
    try {
      const snap = JSON.parse(raw) as Snapshot;
      for (const job of snap.jobs ?? []) this.jobs.set(job.id, job);
      for (const [jobId, list] of Object.entries(snap.leads ?? {})) this.leads.set(jobId, list);
      for (const company of snap.companies ?? []) this.indexCompany(company);
      this.icp = snap.icp ?? null;
      this.logger.info({ jobs: this.jobs.size, file: this.file }, "loaded saved jobs");
    } catch (err) {
      this.logger.error({ err, file: this.file }, "could not read saved jobs; starting empty");
    }
  }

  /** Schedule a snapshot write. Cheap to call after every change. */
  save(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 400);
    this.saveTimer.unref();
  }

  async flush(): Promise<void> {
    if (!this.file) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const file = this.file;
    const snap: Snapshot = {
      version: 1,
      jobs: [...this.jobs.values()],
      leads: Object.fromEntries(this.leads),
      companies: [...this.companies.values()],
      icp: this.icp,
    };
    this.writing = this.writing.then(async () => {
      try {
        await mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(snap), { mode: 0o600 });
        await rename(tmp, file);
      } catch (err) {
        this.logger.error({ err, file }, "could not save jobs");
      }
    });
    await this.writing;
  }

  // ── Saved ICP (stage 1) ───────────────────────────────────────────────────
  getIcp(): IcpCriteria | null {
    return this.icp;
  }

  setIcp(icp: IcpCriteria): void {
    this.icp = icp;
    this.save();
  }

  // ── Uploads ──────────────────────────────────────────────────────────────
  addUpload(upload: Omit<Upload, "id" | "createdAt">): Upload {
    this.expireUploads();
    const record: Upload = { ...upload, id: newId("upl"), createdAt: Date.now() };
    this.uploads.set(record.id, record);
    return record;
  }

  getUpload(id: string): Upload | undefined {
    this.expireUploads();
    return this.uploads.get(id);
  }

  deleteUpload(id: string): void {
    this.uploads.delete(id);
  }

  private expireUploads(): void {
    const cutoff = Date.now() - UPLOAD_TTL_MS;
    for (const [id, u] of this.uploads) if (u.createdAt < cutoff) this.uploads.delete(id);
    while (this.uploads.size > MAX_UPLOADS) {
      const oldest = this.uploads.keys().next().value;
      if (oldest === undefined) break;
      this.uploads.delete(oldest);
    }
  }

  // ── Jobs and leads ───────────────────────────────────────────────────────
  createJob(job: EnrichmentJob, leads: LeadRecord[]): void {
    this.jobs.set(job.id, job);
    this.leads.set(job.id, leads);
    this.save();
  }

  getJob(id: string): EnrichmentJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(): EnrichmentJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getLeads(jobId: string): LeadRecord[] {
    return this.leads.get(jobId) ?? [];
  }

  deleteJob(id: string): boolean {
    const existed = this.jobs.delete(id);
    this.leads.delete(id);
    this.save();
    return existed;
  }

  // ── Company profiles (shared across jobs, unique per cache key) ──────────
  getCompany(id: string): CompanyProfile | undefined {
    return this.companies.get(id);
  }

  findCachedCompany(cacheKey: string, maxAgeDays: number): CompanyProfile | undefined {
    if (maxAgeDays <= 0) return undefined;
    const id = this.cacheIndex.get(cacheKey);
    const company = id ? this.companies.get(id) : undefined;
    if (!company) return undefined;
    const ageDays = (Date.now() - Date.parse(company.enrichedAt)) / 86_400_000;
    return ageDays <= maxAgeDays ? company : undefined;
  }

  saveCompany(company: CompanyProfile): void {
    this.indexCompany(company);
    this.save();
  }

  private indexCompany(company: CompanyProfile): void {
    this.companies.set(company.id, company);
    this.cacheIndex.set(company.cacheKey, company.id);
  }

  /** Delete old jobs (they hold contact data) and company profiles no job uses. */
  purge(retentionDays: number, cacheDays: number): number {
    let removed = 0;
    if (retentionDays > 0) {
      const cutoff = Date.now() - retentionDays * 86_400_000;
      for (const job of this.jobs.values()) {
        if (Date.parse(job.createdAt) < cutoff && !["queued", "processing"].includes(job.status)) {
          this.deleteJob(job.id);
          removed++;
        }
      }
    }
    const inUse = new Set(
      [...this.jobs.values()].flatMap((j) =>
        j.tasks.flatMap((t) => (t.companyId ? [t.companyId] : [])),
      ),
    );
    const keepFor = Math.max(cacheDays, 0) * 86_400_000;
    for (const company of this.companies.values()) {
      if (!inUse.has(company.id) && Date.now() - Date.parse(company.enrichedAt) > keepFor) {
        this.companies.delete(company.id);
        if (this.cacheIndex.get(company.cacheKey) === company.id)
          this.cacheIndex.delete(company.cacheKey);
      }
    }
    if (removed) this.save();
    return removed;
  }
}
