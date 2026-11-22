// The lap-comparison tool output the debrief AI reads (race-eng/lap-comparison@0.2, from spikes 3 and 4),
// and the data gates applied before the model sees it.

export type ReportableMetric = 'time' | 'brakePoint' | 'minSpeed' | 'exitSpeed';

export interface CornerComparison {
  corner: string;
  areaLabel: string;
  segment: { fromM: number; toM: number };
  /** null when time isn't reportable for this corner (removed by the data gates). */
  timeDeltaS: number | null;
  brakePointM: { a: number | null; b: number | null; deltaM: number | null };
  minSpeedKmh: { a: number | null; b: number | null; delta: number | null; atM?: unknown };
  exitSpeedKmh: { a: number | null; b: number | null; delta: number | null };
  brakeFlagM?: unknown;
  kind?: string;
  linked: boolean;
  reportable: Record<ReportableMetric, boolean | null>;
}

export interface LapComparison {
  schema: string;
  quality: {
    techniqueClaimsAllowed: boolean;
    reportableThresholds: { timeDeltaS: number };
    warnings: string[];
    [k: string]: unknown;
  };
  corners: CornerComparison[];
  trace?: unknown;
  [k: string]: unknown;
}

/** Field of a corner that holds each reportable metric. */
export const METRIC_FIELD: Record<ReportableMetric, keyof CornerComparison> = {
  time: 'timeDeltaS',
  brakePoint: 'brakePointM',
  minSpeed: 'minSpeedKmh',
  exitSpeed: 'exitSpeedKmh',
};
const FIELD_METRIC: Record<string, ReportableMetric> = Object.fromEntries(
  Object.entries(METRIC_FIELD).map(([m, f]) => [f, m as ReportableMetric]),
);

/** True when a path like "corners[3].minSpeedKmh.delta" points at a metric flagged as not reportable. */
export const isNonReportablePath = (p: LapComparison, path: string): boolean => {
  const m = /^\$?\.?corners\[(\d+)\]\.(\w+)/.exec(String(path));
  if (!m) return false;
  const metric = FIELD_METRIC[m[2] as string];
  const corner = p.corners[Number(m[1])];
  // Only an explicit true is reportable: false and null (unknown) both block the metric.
  return Boolean(metric && corner && corner.reportable[metric] !== true);
};

/**
 * Data gates (spike 4, condition 3): the model can't quote what it never sees.
 * - Removes the full traces (the model gets the summary; charts reference trace paths by name).
 * - When technique claims are not allowed, removes every braking-point value.
 * - Removes the values of metrics flagged as not reportable (the flags stay, so the model can say why).
 */
export const redactForModel = (p: LapComparison): LapComparison => {
  const { trace: _trace, ...rest } = p;
  const corners = p.corners.map((c) => {
    const out: CornerComparison = {
      ...c,
      brakePointM: { ...c.brakePointM },
      minSpeedKmh: { ...c.minSpeedKmh },
      exitSpeedKmh: { ...c.exitSpeedKmh },
    };
    const hideBraking =
      !p.quality.techniqueClaimsAllowed || c.linked || c.reportable.brakePoint !== true;
    if (hideBraking) out.brakePointM = { a: null, b: null, deltaM: null };
    if (c.reportable.time !== true) out.timeDeltaS = null;
    if (c.reportable.minSpeed !== true) out.minSpeedKmh = { a: null, b: null, delta: null };
    if (c.reportable.exitSpeed !== true) out.exitSpeedKmh = { a: null, b: null, delta: null };
    delete out.brakeFlagM;
    return out;
  });
  return { ...rest, corners };
};

/** The 3 largest losses above the time threshold, in order: what a correct debrief must pick. */
export const expectedTop3 = (p: LapComparison): string[] =>
  [...p.corners]
    .filter((c) => (c.timeDeltaS ?? -Infinity) >= p.quality.reportableThresholds.timeDeltaS)
    .sort((a, b) => (b.timeDeltaS ?? 0) - (a.timeDeltaS ?? 0))
    .slice(0, 3)
    .map((c) => c.corner);

/** True when lap B needs a warning: invalid, slower than 105 %, or a standing start. */
export const lapWarningRequired = (p: LapComparison): boolean =>
  p.quality.warnings.some((w) => /INVALID|105%|standing/.test(w));
