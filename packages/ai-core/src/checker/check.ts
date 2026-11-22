// The runtime checker (SIE-28): run on every AI answer before anyone sees it.
// Policy: check → if anything fails, regenerate once → if it still fails, drop the failing points.

import { cornersMentioned, gateViolations, BANNED_STRATEGY_WORDING, LAP_WARNING } from './gates.js';
import { isNonReportablePath, lapWarningRequired, type LapComparison } from './lap-comparison.js';
import {
  answerText,
  candidateSet,
  checkGrounding,
  evidenceMatches,
  resolvePath,
} from './numbers.js';
import type { ChartAnswer, DebriefAnswer, RadioAnswer } from './outputs.js';

export interface PointCheck {
  rank: number;
  corner: string;
  problems: string[];
}

export interface DebriefCheck {
  pass: boolean;
  /** Problems with a single point: that point can be dropped. */
  points: PointCheck[];
  /** Problems with the whole answer (missing lap warning, ungrounded summary): needs a regeneration. */
  answerProblems: string[];
}

/** Checks a debrief against the tool data the model saw. */
export const checkDebrief = (answer: DebriefAnswer, data: LapComparison): DebriefCheck => {
  const cands = candidateSet(data);
  const points = answer.points.map((pt): PointCheck => {
    const problems: string[] = [];
    if (!data.corners.some((c) => c.corner === pt.corner))
      problems.push(`unknown corner "${pt.corner}"`);
    const g = checkGrounding(
      answerText({
        headline: pt.headline,
        driverAction: pt.driverAction,
        evidence: pt.evidence,
      }).join('\n'),
      data,
      cands,
    );
    if (!g.pass) problems.push(`numbers not in the data: ${g.ungrounded.join(', ')}`);
    for (const e of pt.evidence) {
      if (!evidenceMatches(data, e.path, e.value))
        problems.push(
          `evidence ${e.path} doesn't hold ${e.value} (has ${String(resolvePath(data, e.path))})`,
        );
      if (isNonReportablePath(data, e.path))
        problems.push(`evidence uses a non-reportable metric: ${e.path}`);
      if (/brakePointM/.test(e.path) && !data.quality.techniqueClaimsAllowed)
        problems.push(`braking evidence while technique claims are off: ${e.path}`);
    }
    problems.push(...gateViolations(`${pt.headline}\n${pt.driverAction}`, data, [pt.corner]));
    return { rank: pt.rank, corner: pt.corner, problems };
  });
  const answerProblems: string[] = [];
  const g = checkGrounding(
    answerText({
      lapWarning: answer.lapWarning,
      summary: answer.summary,
      refusals: answer.refusals,
    }).join('\n'),
    data,
    cands,
  );
  if (!g.pass)
    answerProblems.push(
      `numbers not in the data (summary, warning or refusals): ${g.ungrounded.join(', ')}`,
    );
  answerProblems.push(...gateViolations(answer.summary, data, []));
  if (lapWarningRequired(data) && !LAP_WARNING.test(answer.lapWarning ?? ''))
    answerProblems.push('missing lap warning (invalid, >105 % or standing start)');
  return {
    pass: answerProblems.length === 0 && points.every((p) => p.problems.length === 0),
    points,
    answerProblems,
  };
};

/**
 * Maps a corner field written as its area label ("the C2 area") back to the corner ID ("C2").
 * The meaning is right but the app needs the exact ID to link the point to the track map; the slip is noted.
 */
export const normaliseCorners = (
  answer: DebriefAnswer,
  data: LapComparison,
): { answer: DebriefAnswer; notes: string[] } => {
  const notes: string[] = [];
  const points = answer.points.map((p) => {
    if (data.corners.some((c) => c.corner === p.corner)) return p;
    const found = cornersMentioned(p.corner, data);
    if (found.length !== 1) return p;
    notes.push(`corner field "${p.corner}" read as ${found[0]}`);
    return { ...p, corner: found[0] as string };
  });
  return { answer: { ...answer, points }, notes };
};

/**
 * Repairs a debrief that still fails after the one regeneration:
 * - drops the failing points (by position, so duplicate ranks can't remove a good point);
 * - adds the lap warning from the data when the model left it out;
 * - drops an ungrounded or gated summary, and refusals with numbers that aren't in the data.
 * Returns null when nothing trustworthy is left, so the caller shows the saved demo answer instead.
 */
export const repairDebrief = (
  answer: DebriefAnswer,
  check: DebriefCheck,
  data: LapComparison,
): DebriefAnswer | null => {
  const points = answer.points
    .filter((_, i) => (check.points[i]?.problems.length ?? 1) === 0)
    .map((p, i) => ({ ...p, rank: i + 1 }));
  if (points.length === 0) return null;
  const cands = candidateSet(data);
  const summaryOk =
    checkGrounding(answer.summary, data, cands).pass &&
    gateViolations(answer.summary, data, []).length === 0;
  const refusals = answer.refusals.filter(
    (r) => checkGrounding(`${r.topic} ${r.reason}`, data, cands).pass,
  );
  const needsWarning = lapWarningRequired(data) && !LAP_WARNING.test(answer.lapWarning ?? '');
  const lapWarning = needsWarning
    ? `Lap not representative: ${data.quality.warnings.join('; ')}`
    : answer.lapWarning;
  return { lapWarning, points, refusals, summary: summaryOk ? answer.summary : '' };
};

export interface ChartCheck {
  pass: boolean;
  problems: string[];
}

/** Checks a follow-up answer with a chart. fullData includes traces (chart paths may point at them). */
export const checkChart = (
  answer: ChartAnswer,
  data: LapComparison,
  fullData: LapComparison,
): ChartCheck => {
  const problems: string[] = [];
  const c = answer.chart;
  if (c.x.rangeM !== null && c.x.rangeM.length !== 2)
    problems.push('chart range must have 2 values');
  for (const path of [c.x.path, ...c.series.map((s) => s.path)]) {
    const v = resolvePath(fullData, path.replace('[*]', '[0]'));
    if (v === undefined || v === null) problems.push(`chart path doesn't exist: ${path}`);
    // The same gates as text: no braking-point series when technique claims are off, no non-reportable metrics.
    if (/brakePointM/.test(path) && !data.quality.techniqueClaimsAllowed)
      problems.push(`braking series while technique claims are off: ${path}`);
    const metric = /^corners\[(\d+|\*)\]\.(\w+)/.exec(path);
    if (metric) {
      const indexes = metric[1] === '*' ? data.corners.map((_, i) => i) : [Number(metric[1])];
      if (indexes.some((i) => isNonReportablePath(data, `corners[${i}].${metric[2]}`))) {
        problems.push(`chart series includes non-reportable values: ${path}`);
      }
    }
  }
  for (const a of c.annotations) {
    const v = resolvePath(data, a.sourcePath);
    if (typeof v !== 'number' || Math.abs(v - a.atM) > 0.51)
      problems.push(`annotation at ${a.atM} m doesn't match ${a.sourcePath}`);
    if (/brakePointM/.test(a.sourcePath) && !data.quality.techniqueClaimsAllowed)
      problems.push('braking annotation while technique claims are off');
  }
  const text = answerText({
    answer: answer.answer,
    title: c.title,
    rangeM: c.x.rangeM,
    labels: c.annotations.map((a) => ({ atM: a.atM, label: a.label })),
  }).join('\n');
  const g = checkGrounding(text, data);
  if (!g.pass) problems.push(`numbers not in the data: ${g.ungrounded.join(', ')}`);
  const context = cornersMentioned(answer.answer, data);
  problems.push(
    ...gateViolations(
      `${answer.answer}\n${c.annotations.map((a) => a.label).join('\n')}`,
      data,
      context,
    ),
  );
  return { pass: problems.length === 0, problems };
};

export interface RadioState {
  stateId: string;
  trackStatus?: string;
  [k: string]: unknown;
}

export interface RadioCallCheck {
  stateId: string;
  call: string;
  words: number;
  problems: string[];
}

export const RADIO_MAX_WORDS = 12;

/** How many laps after a stop under VSC/SC the call must still say so. */
const RECENT_STOP_LAPS = 2;

/**
 * Which track status a radio call must mention: the current one (VSC or safety car now), a stop in progress
 * under it, or a stop under it in the last two laps. Older stops don't force a mention on every later lap.
 */
export const trackStatusToMention = (state: RadioState): { vsc: boolean; sc: boolean } => {
  const now = String(state.trackStatus ?? '').toLowerCase();
  const lap = typeof state['lap'] === 'number' ? state['lap'] : null;
  const inProgress = state['stopInProgress'];
  const stops = [inProgress, state['lastStop']].filter(
    (x): x is { inLap?: number; underSafetyCar?: string } => typeof x === 'object' && x !== null,
  );
  const recent = (s: { inLap?: number }) =>
    s === inProgress ||
    (lap !== null && typeof s.inLap === 'number' && lap - s.inLap <= RECENT_STOP_LAPS);
  const stopUnder = (kind: string) =>
    stops.some((s) => recent(s) && String(s.underSafetyCar ?? '').toLowerCase() === kind);
  return {
    vsc: /\bvsc\b|virtual/.test(now) || stopUnder('vsc'),
    sc: (!/virtual/.test(now) && /safety car|^sc$/.test(now)) || stopUnder('sc'),
  };
};

/** Checks radio calls: ≤ 12 words, numbers from that state only, wording rules, VSC/SC always called. */
export const checkRadio = (answer: RadioAnswer, states: readonly RadioState[]): RadioCallCheck[] =>
  answer.calls.map((c) => {
    const state = states.find((s) => s.stateId === c.stateId);
    const words = c.call.trim().split(/\s+/).filter(Boolean).length;
    const problems: string[] = [];
    if (!state) problems.push('unknown state');
    if (words > RADIO_MAX_WORDS) problems.push(`${words} words (max ${RADIO_MAX_WORDS})`);
    if (state) {
      const g = checkGrounding(c.call, state);
      if (!g.pass) problems.push(`numbers not in this state: ${g.ungrounded.join(', ')}`);
      const needs = trackStatusToMention(state);
      if (needs.vsc && !/\bVSC\b|virtual safety car/i.test(c.call))
        problems.push('VSC not mentioned');
      if (needs.sc && !/safety car|\bSC\b/i.test(c.call)) problems.push('safety car not mentioned');
    }
    if (BANNED_STRATEGY_WORDING.test(c.call))
      problems.push('banned wording (pit stop duration / tyre wear)');
    return { stateId: c.stateId, call: c.call, words, problems };
  });

/**
 * Runs a generator under the checker: one regeneration on failure, then repair (e.g. drop failing points).
 * Returns the answer to show and the trail of what happened, for the evidence trail and evals.
 */
export const withChecker = async <A, C extends { pass: boolean }>(
  generate: (attempt: number) => Promise<A>,
  check: (a: A) => C,
  repair: (a: A, c: C) => A | null,
): Promise<{ answer: A | null; attempts: { answer: A; check: C }[]; repaired: boolean }> => {
  const attempts: { answer: A; check: C }[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const answer = await generate(attempt);
    const result = check(answer);
    attempts.push({ answer, check: result });
    if (result.pass) return { answer, attempts, repaired: false };
  }
  const last = attempts[attempts.length - 1] as { answer: A; check: C };
  return { answer: repair(last.answer, last.check), attempts, repaired: true };
};
