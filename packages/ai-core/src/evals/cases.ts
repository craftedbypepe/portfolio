// Eval cases: realistic inputs plus what a correct answer must (and must not) do.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RadioState } from '../checker/check.js';
import type { LapComparison } from '../checker/lap-comparison.js';

export const EVALS_DIR = join(import.meta.dirname, '../../evals');

export interface DebriefExpected {
  top3Order: string[];
  lapWarningRequired: boolean;
}
export interface ChartExpected {
  rangeMMustCover?: [number, number];
  answerMustCite?: string[];
  refusalRequired?: string;
  chartType?: string[];
  seriesIncludeOneOf?: string[];
}

export type EvalCase =
  | { id: string; kind: 'debrief'; note: string; payload: LapComparison; expected: DebriefExpected }
  | {
      id: string;
      kind: 'followup-chart';
      note: string;
      payload: LapComparison;
      question: string;
      expected: ChartExpected;
    }
  | {
      id: string;
      kind: 'radio';
      note: string;
      states: RadioState[];
      expected: Record<string, unknown>;
    };

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export const loadCases = (only?: readonly string[]): EvalCase[] =>
  readdirSync(join(EVALS_DIR, 'cases'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(EVALS_DIR, 'cases', f)) as Record<string, any>) // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter((c) => !only?.length || only.includes(c['id']))
    .map((c): EvalCase => {
      const input = c['input'];
      if (c['kind'] === 'radio') {
        return {
          id: c['id'],
          kind: 'radio',
          note: c['note'],
          states: readJson(join(EVALS_DIR, 'fixtures', input.states)) as RadioState[],
          expected: c['expected'],
        };
      }
      const payload = (input.payloadInline ??
        readJson(join(EVALS_DIR, 'fixtures/payloads', input.payload))) as LapComparison;
      if (c['kind'] === 'followup-chart') {
        return {
          id: c['id'],
          kind: 'followup-chart',
          note: c['note'],
          payload,
          question: input.question,
          expected: c['expected'],
        };
      }
      return { id: c['id'], kind: 'debrief', note: c['note'], payload, expected: c['expected'] };
    });
