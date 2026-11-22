// Live model calls for evals (local only: keys come from the environment, never from the repo or CI).
// Structured output on both providers (spike 4, condition 1). A budget cap stops a run before it overspends.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVALS_DIR } from './cases.js';

export interface ModelCall {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  schemaName: string;
}

export interface ModelResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
}

const PRICING = (
  JSON.parse(readFileSync(join(EVALS_DIR, 'pricing.json'), 'utf8')) as {
    models: Record<string, { input: number; output: number }>;
  }
).models;

export const costOf = (model: string, inputTokens: number, outputTokens: number): number => {
  const p = PRICING[model];
  if (!p) throw new Error(`No pricing for ${model}`);
  return (inputTokens * p.input + outputTokens * p.output) / 1e6;
};

export class Budget {
  spent = 0;
  constructor(readonly capUsd: number) {}
  check(): void {
    if (this.spent >= this.capUsd)
      throw new Error(`Budget cap reached: $${this.spent.toFixed(4)} of $${this.capUsd}`);
  }
  add(usd: number): void {
    this.spent += usd;
  }
}

// Provider responses are untyped JSON; only the fields read below are used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiJson = Record<string, any>;

const key = (name: string): string => {
  const v = process.env[name];
  if (!v)
    throw new Error(`${name} is not set. Load it with: set -a; . ~/.config/race-eng/.env; set +a`);
  return v;
};

const post = async (
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<ApiJson> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    // Gateways can return HTML on 5xx: read text first so a non-JSON body is retried, not thrown.
    const raw = await res.text();
    let json: ApiJson;
    try {
      json = JSON.parse(raw) as ApiJson;
    } catch {
      json = { error: { type: 'non-json response', message: raw.slice(0, 120) } };
    }
    if (res.ok) return json;
    if (![429, 500, 502, 503, 529].includes(res.status))
      throw new Error(
        `API ${res.status}: ${json?.error?.type ?? ''} ${json?.error?.message ?? ''}`,
      );
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error('API kept failing after 3 attempts');
};

const callAnthropic = async (c: ModelCall): Promise<ModelResult> => {
  const t0 = performance.now();
  const body = await post(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': key('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
    {
      model: c.model,
      max_tokens: 4000,
      system: c.system,
      messages: [{ role: 'user', content: c.user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: c.schema } },
    },
  );
  const text = (body['content'] as { type: string; text?: string }[])
    .filter((x) => x.type === 'text')
    .map((x) => x.text ?? '')
    .join('');
  const inputTokens = body['usage'].input_tokens as number;
  const outputTokens = body['usage'].output_tokens as number;
  return {
    text,
    inputTokens,
    outputTokens,
    latencyMs: Math.round(performance.now() - t0),
    costUsd: costOf(c.model, inputTokens, outputTokens),
  };
};

const callOpenAI = async (c: ModelCall): Promise<ModelResult> => {
  const t0 = performance.now();
  const body = await post(
    'https://api.openai.com/v1/responses',
    { Authorization: `Bearer ${key('OPENAI_API_KEY')}` },
    {
      model: c.model,
      instructions: c.system,
      input: [{ role: 'user', content: c.user }],
      max_output_tokens: 4000,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name: c.schemaName, schema: c.schema, strict: true } },
    },
  );
  const text = (body['output'] as { type: string; content?: { type: string; text: string }[] }[])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((x) => x.type === 'output_text')
    .map((x) => x.text)
    .join('');
  const inputTokens = body['usage'].input_tokens as number;
  const outputTokens = body['usage'].output_tokens as number;
  return {
    text,
    inputTokens,
    outputTokens,
    latencyMs: Math.round(performance.now() - t0),
    costUsd: costOf(c.model, inputTokens, outputTokens),
  };
};

/** Throws before any paid call when a model has no pricing, so the budget can always be enforced. */
export const assertPriced = (model: string): void => {
  if (!PRICING[model])
    throw new Error(`No pricing for ${model} in evals/pricing.json: add it before a live run`);
};

export const callModel = (c: ModelCall): Promise<ModelResult> =>
  c.model.startsWith('gpt-') ? callOpenAI(c) : callAnthropic(c);
