// The eval runner: for each model and case, get an answer (saved or live), score it, and build a scorecard.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { redactForModel } from '../checker/lap-comparison.js';
import { ChartAnswer, DebriefAnswer, RadioAnswer, jsonSchemaOf } from '../checker/outputs.js';
import { EVALS_DIR, type EvalCase } from './cases.js';
import { Budget, callModel, type ModelResult } from './clients.js';
import { scoreAnswer, type CaseScore } from './score.js';

export interface Recording extends ModelResult {
  caseId: string;
  model: string;
  recordedAt: string;
  source: string;
}

export interface RunRow extends CaseScore {
  model: string;
  /** "recorded", "live", or "missing" when recorded mode has no saved answer for this case. */
  origin: 'recorded' | 'live' | 'missing';
  latencyMs: number | null;
  costUsd: number | null;
}

const prompt = (name: string): string => readFileSync(join(EVALS_DIR, 'prompts', name), 'utf8');

/** Builds the exact request the app would send for a case: the same data gates and format. */
export const requestFor = (c: EvalCase, model: string) => {
  if (c.kind === 'debrief') {
    return {
      model,
      system: prompt('B-structured.md'),
      user: JSON.stringify(redactForModel(c.payload)),
      schema: jsonSchemaOf(DebriefAnswer),
      schemaName: 'debrief',
    };
  }
  if (c.kind === 'followup-chart') {
    const user = `${JSON.stringify(redactForModel(c.payload))}\n\nDriver question: ${c.question}`;
    return {
      model,
      system: `${prompt('B-structured.md')}\n\n${prompt('followup-chart.md')}`,
      user,
      schema: jsonSchemaOf(ChartAnswer),
      schemaName: 'chart_answer',
    };
  }
  return {
    model,
    system: prompt('radio.md'),
    user: JSON.stringify(c.states),
    schema: jsonSchemaOf(RadioAnswer),
    schemaName: 'radio_calls',
  };
};

const recordingPath = (model: string, caseId: string) =>
  join(EVALS_DIR, 'recordings', model, `${caseId}.json`);

export interface RunOptions {
  mode: 'recorded' | 'live';
  models: string[];
  cases: EvalCase[];
  budgetUsd?: number;
  /** Live mode: save each answer as the new recording for that model and case. */
  saveRecordings?: boolean;
  onProgress?: (row: RunRow) => void;
}

export const runEvals = async (o: RunOptions): Promise<{ rows: RunRow[]; spentUsd: number }> => {
  const budget = new Budget(o.budgetUsd ?? 1);
  const rows: RunRow[] = [];
  for (const model of o.models) {
    for (const c of o.cases) {
      let row: RunRow;
      if (o.mode === 'recorded') {
        const path = recordingPath(model, c.id);
        if (!existsSync(path)) {
          row = {
            caseId: c.id,
            kind: c.kind,
            model,
            origin: 'missing',
            pass: false,
            checks: {},
            problems: ['no saved answer'],
            latencyMs: null,
            costUsd: null,
          };
        } else {
          const rec = JSON.parse(readFileSync(path, 'utf8')) as Recording & { usage?: unknown };
          row = {
            ...scoreAnswer(c, rec.text),
            model,
            origin: 'recorded',
            latencyMs: rec.latencyMs ?? null,
            costUsd: rec.costUsd ?? null,
          };
        }
      } else {
        budget.check();
        const result = await callModel(requestFor(c, model));
        budget.add(result.costUsd);
        if (o.saveRecordings) {
          mkdirSync(join(EVALS_DIR, 'recordings', model), { recursive: true });
          const rec: Recording = {
            ...result,
            caseId: c.id,
            model,
            recordedAt: new Date().toISOString(),
            source: 'live eval run',
          };
          writeFileSync(recordingPath(model, c.id), `${JSON.stringify(rec, null, 1)}\n`);
        }
        row = {
          ...scoreAnswer(c, result.text),
          model,
          origin: 'live',
          latencyMs: result.latencyMs,
          costUsd: result.costUsd,
        };
      }
      rows.push(row);
      o.onProgress?.(row);
    }
  }
  return { rows, spentUsd: budget.spent };
};

/** A readable scorecard: pass rates per model and kind, then every failure with its reason. */
export const scorecard = (rows: readonly RunRow[], title: string): string => {
  const lines = [
    `# ${title}`,
    '',
    '| Model | Debriefs | Follow-up charts | Radio | All | Median latency | Cost |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const model of [...new Set(rows.map((r) => r.model))]) {
    const mine = rows.filter((r) => r.model === model && r.origin !== 'missing');
    const rate = (kind?: string) => {
      const set = mine.filter((r) => !kind || r.kind === kind);
      return set.length ? `${set.filter((r) => r.pass).length}/${set.length}` : '–';
    };
    const lat = mine
      .map((r) => r.latencyMs)
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    const median = lat.length
      ? `${((lat[Math.floor(lat.length / 2)] ?? 0) / 1000).toFixed(1)} s`
      : '–';
    const cost = mine.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    lines.push(
      `| ${model} | ${rate('debrief')} | ${rate('followup-chart')} | ${rate('radio')} | ${rate()} | ${median} | $${cost.toFixed(4)} |`,
    );
  }
  const missing = rows.filter((r) => r.origin === 'missing');
  if (missing.length)
    lines.push(
      '',
      `No saved answer yet: ${missing.map((r) => `${r.model} ${r.caseId}`).join(', ')}.`,
    );
  const failures = rows.filter((r) => !r.pass && r.origin !== 'missing');
  if (failures.length) {
    lines.push('', '## Failures', '');
    for (const f of failures)
      lines.push(`- **${f.model} ${f.caseId}** (${f.kind}): ${f.problems.slice(0, 3).join('; ')}`);
  }
  return `${lines.join('\n')}\n`;
};
