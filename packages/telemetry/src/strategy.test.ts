import { describe, expect, it } from 'vitest';
import { linearFit, median, periodsFromLaps, worseStatus } from './index.js';

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('linearFit', () => {
  it('fits a perfect line', () => {
    const fit = linearFit([1, 2, 3, 4], [90, 90.1, 90.2, 90.3])!;
    expect(fit.slope).toBeCloseTo(0.1, 6);
    expect(fit.r2).toBeCloseTo(1, 6);
  });

  it('needs at least three points', () => {
    expect(linearFit([1, 2], [1, 2])).toBeNull();
  });
});

describe('track status', () => {
  it('keeps the more severe status', () => {
    expect(worseStatus('green', 'vsc')).toBe('vsc');
    expect(worseStatus('sc', 'vsc')).toBe('sc');
    expect(worseStatus(null, 'green')).toBe('green');
    expect(worseStatus(null, null)).toBeNull();
  });

  it('groups consecutive laps into periods', () => {
    const laps = [1, 2, 3, 4, 5, 6].map((n) => ({
      lapNumber: n,
      trackStatus:
        n === 2 || n === 3 ? ('vsc' as const) : n === 5 ? ('sc' as const) : ('green' as const),
    }));
    expect(periodsFromLaps(laps)).toEqual([
      { status: 'vsc', fromLap: 2, toLap: 3 },
      { status: 'sc', fromLap: 5, toLap: 5 },
    ]);
  });
});
