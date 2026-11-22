// Distance alignment for laps (ported from spike 3, with the SIE-20 fixes):
// - stale repeated frames and post-line wrap are dropped (distance must strictly increase inside the lap);
// - line crossings are re-estimated from the lap's first and last samples and local speed,
//   because the game's lap-number flag lags lapDistance by a few frames;
// - the time trace is pinned to the official sector and lap times;
// - every lap uses the same grid starting at 0 m, so laps align by metres, not by index.

export interface RawLap {
  t: number[];
  d: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
  gear: number[];
  x: number[];
  y: number[];
}

export interface Trace {
  d: number[];
  tau: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
  gear: number[];
  x: number[];
  y: number[];
}

export const gridOf = (lengthM: number, stepM: number): number[] => {
  const g: number[] = [];
  for (let d = 0; d < lengthM - 1e-9; d += stepM) g.push(Number(d.toFixed(6)));
  g.push(lengthM);
  return g;
};

const get = (a: readonly number[], i: number): number => a[i] ?? Number.NaN;

/** Linear interpolation of y(x) at xs. x must be strictly increasing; values clamp at the ends. */
export const interp = (
  x: readonly number[],
  y: readonly number[],
  xs: readonly number[],
): number[] => {
  const out: number[] = [];
  let j = 0;
  for (const q of xs) {
    while (j < x.length - 2 && get(x, j + 1) < q) j++;
    const x0 = get(x, j);
    const x1 = get(x, j + 1);
    const f = Math.min(1, Math.max(0, (q - x0) / (x1 - x0)));
    out.push(get(y, j) + (get(y, j + 1) - get(y, j)) * f);
  }
  return out;
};

/** Previous-value lookup, for stepped channels such as gear. */
export const stepLookup = (
  x: readonly number[],
  y: readonly number[],
  xs: readonly number[],
): number[] => {
  let j = 0;
  return xs.map((q) => {
    while (j < x.length - 1 && get(x, j + 1) <= q) j++;
    return get(y, j);
  });
};

/** Keeps samples with 0 < d < L and strictly increasing distance: drops stale frames and the post-line wrap. */
export const cleanRaw = (r: RawLap, lengthM: number): RawLap => {
  const keep: number[] = [];
  for (let i = 0; i < r.d.length; i++) {
    const d = get(r.d, i);
    if (!(d > 0 && d < lengthM)) continue;
    const last = keep[keep.length - 1];
    if (last !== undefined && d <= get(r.d, last)) continue;
    keep.push(i);
  }
  const pick = (a: readonly number[]) => keep.map((i) => get(a, i));
  return {
    t: pick(r.t),
    d: pick(r.d),
    speed: pick(r.speed),
    throttle: pick(r.throttle),
    brake: pick(r.brake),
    gear: pick(r.gear),
    x: pick(r.x),
    y: pick(r.y),
  };
};

/** Below this speed an extrapolated crossing is unreliable (standing starts); fall back to the lap flag. */
const MIN_EXTRAP_KMH = 50;

export interface CrossingEstimate {
  startT: number;
  endT: number;
  method: 'extrapolated' | 'lap-flag';
}

/**
 * Re-estimates when the car crossed the line at both ends of a lap:
 * t0 = t(d0) - d0/v0 and tN = t(dN) + (L - dN)/vN. Falls back to the lap-flag times at low speed.
 */
export const estimateCrossings = (
  c: RawLap,
  lengthM: number,
  flag: { startT: number | null; endT: number | null },
): CrossingEstimate | null => {
  const n = c.d.length;
  if (n < 2) return null;
  const v0 = get(c.speed, 0);
  const vN = get(c.speed, n - 1);
  const canExtrap = v0 >= MIN_EXTRAP_KMH && vN >= MIN_EXTRAP_KMH;
  if (canExtrap) {
    return {
      startT: get(c.t, 0) - get(c.d, 0) / (v0 / 3.6),
      endT: get(c.t, n - 1) + (lengthM - get(c.d, n - 1)) / (vN / 3.6),
      method: 'extrapolated',
    };
  }
  if (flag.startT === null || flag.endT === null) return null;
  return { startT: flag.startT, endT: flag.endT, method: 'lap-flag' };
};

/** Resamples a cleaned lap onto the 0..L grid, with tau = seconds since the estimated start crossing. */
export const traceFromRaw = (
  c: RawLap,
  lengthM: number,
  stepM: number,
  crossing: CrossingEstimate,
): Trace => {
  const lapS = crossing.endT - crossing.startT;
  const D = [0, ...c.d, lengthM];
  const T = [0, ...c.t.map((t) => t - crossing.startT), lapS];
  const ext = (a: readonly number[]) => [get(a, 0), ...a, get(a, a.length - 1)];
  const g = gridOf(lengthM, stepM);
  return {
    d: g,
    tau: interp(D, T, g),
    speed: interp(D, ext(c.speed), g),
    throttle: interp(D, ext(c.throttle), g),
    brake: interp(D, ext(c.brake), g),
    gear: stepLookup(D, ext(c.gear), g),
    x: interp(D, ext(c.x), g),
    y: interp(D, ext(c.y), g),
  };
};

export interface Anchor {
  d: number;
  t: number;
}

/** Piecewise-linear time warp so tau hits the official split times at the anchor distances. */
export const anchorTrace = (tr: Trace, anchors: readonly Anchor[]): Trace => {
  if (anchors.length === 0) return tr;
  const A = [{ d: 0, t: 0 }, ...anchors].sort((p, q) => p.d - q.d);
  const measured = interp(
    tr.d,
    tr.tau,
    A.map((a) => a.d),
  );
  const corr = interp(
    A.map((a) => a.d),
    A.map((a, i) => a.t - get(measured, i)),
    tr.d,
  );
  return { ...tr, tau: tr.tau.map((t, i) => t + get(corr, i)) };
};

/** Largest distance gap between consecutive samples, in metres. */
export const largestGap = (d: readonly number[], lengthM: number): number => {
  if (d.length === 0) return lengthM;
  let gap = get(d, 0);
  for (let i = 1; i < d.length; i++) gap = Math.max(gap, get(d, i) - get(d, i - 1));
  return Math.max(gap, lengthM - get(d, d.length - 1));
};
