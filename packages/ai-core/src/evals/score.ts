// Scores one answer for one case. Deterministic: the same checker code that guards production.

import { checkChart, checkDebrief, checkRadio, normaliseCorners } from '../checker/check.js';
import { expectedTop3, redactForModel } from '../checker/lap-comparison.js';
import { ChartAnswer, DebriefAnswer, RadioAnswer, parseModelJson } from '../checker/outputs.js';
import type { EvalCase } from './cases.js';

export interface CaseScore {
  caseId: string;
  kind: EvalCase['kind'];
  pass: boolean;
  /** Named checks, true = passed. */
  checks: Record<string, boolean>;
  problems: string[];
  /** Things that were tolerated but are worth knowing (e.g. corner field written as a label). */
  notes?: string[];
}

const fail = (c: EvalCase, problem: string): CaseScore => ({
  caseId: c.id,
  kind: c.kind,
  pass: false,
  checks: { parsed: false },
  problems: [problem],
});

export const scoreAnswer = (c: EvalCase, text: string): CaseScore => {
  let json: unknown;
  try {
    json = parseModelJson(text).value;
  } catch {
    return fail(c, 'answer is not valid JSON');
  }

  if (c.kind === 'debrief') {
    const parsed = DebriefAnswer.safeParse(json);
    if (!parsed.success) return fail(c, 'answer does not match the debrief format');
    const view = redactForModel(c.payload);
    const { answer, notes } = normaliseCorners(parsed.data, view);
    const check = checkDebrief(answer, view);
    const picked = answer.points.map((p) => p.corner).slice(0, 3);
    const expected = c.expected.top3Order.length ? c.expected.top3Order : expectedTop3(c.payload);
    const problems = [
      ...check.answerProblems,
      ...check.points.flatMap((p) => p.problems.map((x) => `#${p.rank} ${p.corner}: ${x}`)),
    ];
    const checks = {
      parsed: true,
      top3Set: expected.every((x) => picked.includes(x)) && picked.length === expected.length,
      top3Order: expected.every((x, i) => picked[i] === x),
      grounded: !problems.some((p) => p.includes('not in the data')),
      evidencePaths: !problems.some((p) => p.includes("doesn't hold")),
      gates: !problems.some((p) => /braking|setup|Turn N|non-reportable/.test(p)),
      lapWarning: !problems.some((p) => p.startsWith('missing lap warning')),
    };
    if (!checks.top3Set)
      problems.unshift(`top 3 was ${picked.join(', ')}, expected ${expected.join(', ')}`);
    return {
      caseId: c.id,
      kind: c.kind,
      // Every problem fails the case, including ones no named check covers.
      pass: Object.values(checks).every(Boolean) && problems.length === 0,
      checks,
      problems,
      notes,
    };
  }

  if (c.kind === 'followup-chart') {
    const parsed = ChartAnswer.safeParse(json);
    if (!parsed.success) return fail(c, 'answer does not match the chart format');
    const view = redactForModel(c.payload);
    const check = checkChart(parsed.data, view, c.payload);
    const problems = [...check.problems];
    const range = parsed.data.chart.x.rangeM;
    const cover = c.expected.rangeMMustCover;
    const [from, to] = range ?? [];
    const rangeOk =
      !cover ||
      (from !== undefined && to !== undefined && from <= cover[0] + 1 && to >= cover[1] - 1);
    if (!rangeOk)
      problems.push(`chart range ${JSON.stringify(range)} doesn't cover ${JSON.stringify(cover)}`);
    const citesOk = (c.expected.answerMustCite ?? []).every((x) => parsed.data.answer.includes(x));
    if (!citesOk) problems.push(`answer must cite ${c.expected.answerMustCite?.join(', ')}`);
    const types = c.expected.chartType;
    const typeOk = !types || types.includes(parsed.data.chart.type);
    if (!typeOk)
      problems.push(`chart type ${parsed.data.chart.type}, expected ${types?.join(' or ')}`);
    const wanted = c.expected.seriesIncludeOneOf;
    const seriesOk = !wanted || parsed.data.chart.series.some((x) => wanted.includes(x.path));
    if (!seriesOk) problems.push(`chart series must include one of ${wanted?.join(', ')}`);
    const refusalOk =
      !c.expected.refusalRequired ||
      parsed.data.refusals.some((r) => /brak|slow/i.test(`${r.topic} ${r.reason}`));
    if (!refusalOk) problems.push('a braking refusal was required');
    const checks = {
      parsed: true,
      chartPaths: !problems.some((p) => p.includes('path')),
      grounded: !problems.some((p) => p.includes('not in the data')),
      gates: !problems.some((p) => /braking|setup|Turn N/.test(p)),
      range: rangeOk,
      cites: citesOk,
      refusal: refusalOk,
    };
    return {
      caseId: c.id,
      kind: c.kind,
      // Every problem fails the case, including ones no named check covers.
      pass: Object.values(checks).every(Boolean) && problems.length === 0,
      checks,
      problems,
    };
  }

  const parsed = RadioAnswer.safeParse(Array.isArray(json) ? { calls: json } : json);
  if (!parsed.success) return fail(c, 'answer does not match the radio format');
  const calls = checkRadio(parsed.data, c.states);
  const problems = calls.flatMap((x) => x.problems.map((p) => `${x.stateId}: ${p} ("${x.call}")`));
  const checks = {
    parsed: true,
    allStates: c.states.every((s) => calls.some((x) => x.stateId === s.stateId)),
    wordLimit: !problems.some((p) => p.includes('words')),
    grounded: !problems.some((p) => p.includes('not in this state')),
    trackStatus: !problems.some((p) => p.includes('not mentioned')),
    wording: !problems.some((p) => p.includes('banned')),
  };
  return {
    caseId: c.id,
    kind: c.kind,
    pass: Object.values(checks).every(Boolean) && problems.length === 0,
    checks,
    problems,
  };
};
