// Answer formats for structured output. The same Zod schemas validate answers and produce the JSON schema
// sent to the provider (spike 4, condition 1: prompt B + structured output).

import { z } from 'zod';

const Evidence = z.object({ metric: z.string(), value: z.number(), path: z.string() });
const Refusal = z.object({ topic: z.string(), reason: z.string() });

export const DebriefAnswer = z.object({
  lapWarning: z.string().nullable(),
  points: z.array(
    z.object({
      rank: z.number().int(),
      corner: z.string(),
      headline: z.string(),
      driverAction: z.string(),
      evidence: z.array(Evidence),
    }),
  ),
  refusals: z.array(Refusal),
  summary: z.string(),
});
export type DebriefAnswer = z.infer<typeof DebriefAnswer>;

export const ChartAnswer = z.object({
  answer: z.string(),
  chart: z.object({
    type: z.enum(['line', 'bar', 'scatter']),
    title: z.string(),
    // rangeM is a plain list, not a tuple: OpenAI's strict mode rejects tuple schemas. The checker enforces 2 values.
    x: z.object({
      path: z.string(),
      label: z.string(),
      rangeM: z.array(z.number()).nullable(),
    }),
    series: z.array(z.object({ path: z.string(), label: z.string() })),
    annotations: z.array(z.object({ atM: z.number(), label: z.string(), sourcePath: z.string() })),
  }),
  refusals: z.array(Refusal),
});
export type ChartAnswer = z.infer<typeof ChartAnswer>;

export const RadioAnswer = z.object({
  calls: z.array(z.object({ stateId: z.string(), call: z.string() })),
});
export type RadioAnswer = z.infer<typeof RadioAnswer>;

/** JSON schema for a provider's structured-output mode. */
export const jsonSchemaOf = (schema: z.ZodType): Record<string, unknown> =>
  z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;

/** Parses model text into JSON: strict first, then the first balanced {...} or [...] block. */
export const parseModelJson = (text: string): { value: unknown; mode: 'strict' | 'lenient' } => {
  const s = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    return { value: JSON.parse(s), mode: 'strict' };
  } catch {
    const starts = ['{', '['].map((c) => s.indexOf(c)).filter((i) => i >= 0);
    const i = Math.min(...starts);
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let k = i; k < s.length; k++) {
      const ch = s[k];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0)
          return {
            value: JSON.parse(s.slice(i, k + 1).replace(/[\n\r\t]/g, ' ')),
            mode: 'lenient',
          };
      }
    }
    throw new Error('No JSON found in the model answer');
  }
};
