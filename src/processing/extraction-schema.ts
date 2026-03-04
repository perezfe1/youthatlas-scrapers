import { z } from 'zod';
import {
  OPPORTUNITY_TYPES,
  REGIONS,
  EDUCATION_LEVELS,
} from '@/types/opportunity.js';

/**
 * Zod schema for validating Claude's extraction output.
 * This is intentionally MORE lenient than the TypeScript type —
 * it coerces and trims strings, provides defaults, and normalizes values
 * before they enter the database.
 */
export const extractedOpportunitySchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .transform((s) => s.trim()),

  description: z
    .string()
    .min(1, 'Description is required')
    .transform((s) => s.trim()),

  summary: z
    .string()
    .min(1, 'Summary is required')
    .transform((s) => s.trim().slice(0, 300)), // Cap at 300 chars

  type: z.enum(OPPORTUNITY_TYPES),

  fields: z
    .array(z.string().transform((s) => s.trim()))
    .default([]),

  regions: z
    .array(z.enum(REGIONS))
    .default(['global']),

  countries: z
    .array(z.string().transform((s) => s.trim()))
    .default([]),

  target_audience: z
    .array(z.enum(EDUCATION_LEVELS))
    .default(['any']),

  eligibility_text: z
    .string()
    .default('')
    .transform((s) => s.trim()),

  deadline: z
    .string()
    .nullable()
    .default(null)
    .transform((val) => {
      if (!val) return null;
      // Validate it looks like a date (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(val)) return null;
      // Verify it's a real date
      const parsed = new Date(val);
      if (isNaN(parsed.getTime())) return null;
      return val;
    }),

  is_rolling: z
    .boolean()
    .default(false),

  funding_amount: z
    .string()
    .nullable()
    .default(null)
    .transform((val) => val?.trim() || null),

  is_fully_funded: z
    .boolean()
    .default(false),

  organization: z
    .string()
    .min(1, 'Organization is required')
    .transform((s) => s.trim()),

  application_url: z
    .string()
    .url()
    .nullable()
    .default(null)
    .catch(null), // If the URL is malformed, just null it out
});

export type ValidatedExtraction = z.infer<typeof extractedOpportunitySchema>;
