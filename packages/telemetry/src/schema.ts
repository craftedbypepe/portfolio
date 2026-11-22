import { z } from 'zod';

// First slice of the source-agnostic session model (SIE-20). Grows during phase 4.
export const LapSummarySchema = z.object({
  carIndex: z.number().int().nonnegative(),
  lapNumber: z.number().int().positive(),
  lapTimeMs: z.number().int().positive(),
  sectorTimesMs: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  // Missing validity stays null: never assumed (PRD v2, data rules).
  valid: z.boolean().nullable(),
});

export type LapSummary = z.infer<typeof LapSummarySchema>;
