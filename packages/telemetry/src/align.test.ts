import { describe, expect, it } from 'vitest';
import {
  anchorTrace,
  cleanRaw,
  estimateCrossings,
  gridOf,
  largestGap,
  traceFromRaw,
  type RawLap,
} from './align.js';

const L = 1000;

/** A lap at constant 180 km/h (50 m/s), sampled every 0.1 s, starting 2 m after the line. */
const steadyLap = (): RawLap => {
  const r: RawLap = { t: [], d: [], speed: [], throttle: [], brake: [], gear: [], x: [], y: [] };
  for (let t = 100.04; ; t += 0.1) {
    const d = (t - 100) * 50;
    if (d >= L) break;
    r.t.push(t);
    r.d.push(d);
    r.speed.push(180);
    r.throttle.push(1);
    r.brake.push(0);
    r.gear.push(7);
    r.x.push(d);
    r.y.push(0);
  }
  return r;
};

describe('gridOf', () => {
  it('starts at 0 m and ends exactly at the lap length', () => {
    const g = gridOf(L, 5);
    expect(g[0]).toBe(0);
    expect(g[1]).toBe(5);
    expect(g[g.length - 1]).toBe(L);
  });
});

describe('cleanRaw', () => {
  it('drops stale repeated frames and the post-line wrap', () => {
    const r = steadyLap();
    r.t.splice(5, 0, r.t[4]!);
    r.d.splice(5, 0, r.d[4]!); // stale repeat
    for (const k of ['speed', 'throttle', 'brake', 'gear', 'x', 'y'] as const)
      r[k].splice(5, 0, r[k][4]!);
    r.t.push(200);
    r.d.push(3); // wrapped past the line
    for (const k of ['speed', 'throttle', 'brake', 'gear', 'x', 'y'] as const) r[k].push(0);
    const c = cleanRaw(r, L);
    expect(c.d).toEqual(steadyLap().d);
  });
});

describe('estimateCrossings', () => {
  it('extrapolates both line crossings from speed', () => {
    const c = cleanRaw(steadyLap(), L);
    const x = estimateCrossings(c, L, { startT: null, endT: null });
    expect(x?.method).toBe('extrapolated');
    expect(x?.startT).toBeCloseTo(100, 6);
    expect(x?.endT).toBeCloseTo(120, 6); // 1000 m at 50 m/s
  });

  it('falls back to the lap flag at low speed (standing start)', () => {
    const c = cleanRaw(steadyLap(), L);
    c.speed[0] = 10;
    const x = estimateCrossings(c, L, { startT: 99.5, endT: 120.1 });
    expect(x).toEqual({ startT: 99.5, endT: 120.1, method: 'lap-flag' });
  });

  it('returns null when it cannot estimate and no flag times exist', () => {
    const c = cleanRaw(steadyLap(), L);
    c.speed[0] = 10;
    expect(estimateCrossings(c, L, { startT: null, endT: null })).toBeNull();
  });
});

describe('traceFromRaw + anchorTrace', () => {
  it('builds a 0..L trace and pins it to the official times', () => {
    const c = cleanRaw(steadyLap(), L);
    const x = estimateCrossings(c, L, { startT: null, endT: null })!;
    const tr = traceFromRaw(c, L, 5, x);
    expect(tr.d[0]).toBe(0);
    expect(tr.tau[0]).toBe(0);
    expect(tr.tau[tr.tau.length - 1]).toBeCloseTo(20, 6);
    // Official times say the lap took 20.1 s, with 10.2 s at the halfway sector line.
    const pinned = anchorTrace(tr, [
      { d: 500, t: 10.2 },
      { d: L, t: 20.1 },
    ]);
    expect(pinned.tau[100]).toBeCloseTo(10.2, 6); // d = 500
    expect(pinned.tau[pinned.tau.length - 1]).toBeCloseTo(20.1, 6);
  });
});

describe('largestGap', () => {
  it('includes the gaps to both lines', () => {
    expect(largestGap([10, 20, 900], L)).toBe(880);
    expect(largestGap([], L)).toBe(L);
  });
});
