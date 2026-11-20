import { z } from "zod";

const column = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const ColumnMappingSchema = z.object({
  email: column,
  contact_name: column,
  company_name: column,
  website: column,
});

const terms = z.array(z.string().trim().min(1).max(80)).max(20).default([]);
const amount = z.number().nonnegative().nullable().default(null);

/** Stage 1: the ideal customer profile. */
export const IcpSchema = z
  .object({
    industries: terms,
    locations: terms,
    min_employees: amount,
    max_employees: amount,
    technologies: terms,
    funding_stages: terms,
    min_funding_usd: amount,
    must_be_hiring: z.boolean().default(false),
  })
  .refine(
    (c) =>
      c.industries.length + c.locations.length + c.technologies.length + c.funding_stages.length >
        0 ||
      c.min_employees !== null ||
      c.max_employees !== null ||
      c.min_funding_usd !== null ||
      c.must_be_hiring,
    { message: "Add at least one ICP criterion" },
  )
  .refine(
    (c) =>
      c.min_employees === null || c.max_employees === null || c.min_employees <= c.max_employees,
    {
      message: "Minimum employees can't be above the maximum",
    },
  );

export type IcpInput = z.infer<typeof IcpSchema>;

export const RunConfigSchema = z.object({
  upload_id: z.string().min(1).max(64),
  column_mapping: ColumnMappingSchema,
  /** Check each signal's source with Olostep Search + Scrape (a few extra credits). */
  verify_signals: z.boolean().default(true),
});

export type RunConfig = z.infer<typeof RunConfigSchema>;

export const ValidateSchema = z.object({ column_mapping: ColumnMappingSchema });
