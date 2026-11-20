import type { Request, Response } from "express";
import { badRequest, notFound } from "../lib/errors.js";
import { parseBody } from "../lib/validate.js";
import {
  detectMapping,
  parseCsv,
  summarize,
  validateRows,
  assertMapping,
  type ColumnMapping,
} from "../services/csv.service.js";
import type { Upload } from "../store/types.js";
import { ValidateSchema } from "../validators/job.schema.js";
import type { AppContext } from "./context.js";
import { leadDto } from "./serializers.js";

const PREVIEW_ROWS = 25;

function previewResponse(upload: Upload, mapping: ColumnMapping) {
  const drafts = validateRows(upload.csv, mapping);
  return {
    upload_id: upload.id,
    filename: upload.filename,
    columns: upload.csv.columns,
    column_mapping: mapping,
    summary: summarize(drafts),
    rows: drafts.slice(0, PREVIEW_ROWS).map((d) => ({
      ...leadDto({
        ...d,
        id: `row_${d.rowIndex}`,
        jobId: "",
        status: d.groupKey ? "pending" : "skipped",
        companyId: null,
        message: null,
      }),
      data: d.data,
    })),
  };
}

export function csvController(ctx: AppContext) {
  return {
    /** POST /api/csv/preview (multipart field "file"): parse, auto-map columns and validate. */
    preview(req: Request, res: Response) {
      const file = req.file;
      if (!file) throw badRequest('Attach a CSV file in the "file" field.');
      if (!/\.csv$/i.test(file.originalname) && !/csv|text\/plain/.test(file.mimetype)) {
        throw badRequest("Only .csv files are supported.");
      }
      const csv = parseCsv(file.buffer.toString("utf8"), ctx.config.maxRows);
      const upload = ctx.store.addUpload({ filename: file.originalname.slice(0, 200), csv });
      res.status(201).json(previewResponse(upload, detectMapping(csv.columns)));
    },

    /** POST /api/csv/:uploadId/validate: re-validate with a manual column mapping. */
    validate(req: Request, res: Response) {
      const upload = ctx.store.getUpload(String(req.params.uploadId));
      if (!upload) throw notFound("Upload (it may have expired; upload the file again)");
      const { column_mapping } = parseBody(ValidateSchema, req.body);
      assertMapping(column_mapping, upload.csv.columns);
      res.json(previewResponse(upload, column_mapping));
    },
  };
}
