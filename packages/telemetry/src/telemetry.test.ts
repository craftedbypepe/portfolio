import { describe, expect, it } from 'vitest';
import { LapSummarySchema, formatLapTime, isAboveNoise } from './index.js';

describe('formatLapTime', () => {
  it('formats minutes, seconds and milliseconds', () => {
    expect(formatLapTime(78_123)).toBe('1:18.123');
    expect(formatLapTime(59_999)).toBe('0:59.999');
  });

  it('rejects invalid input', () => {
    expect(() => formatLapTime(-1)).toThrow(RangeError);
    expect(() => formatLapTime(Number.NaN)).toThrow(RangeError);
  });
});

describe('isAboveNoise', () => {
  it('uses the PRD thresholds', () => {
    expect(isAboveNoise('timeS', 0.029)).toBe(false);
    expect(isAboveNoise('timeS', -0.03)).toBe(true);
    expect(isAboveNoise('speedKmh', 1.9)).toBe(false);
    expect(isAboveNoise('distanceM', 6)).toBe(true);
  });
});

describe('LapSummarySchema', () => {
  it('keeps unknown validity as null', () => {
    const lap = LapSummarySchema.parse({
      carIndex: 0,
      lapNumber: 2,
      lapTimeMs: 78_123,
      sectorTimesMs: [25_000, 27_000, 26_123],
      valid: null,
    });
    expect(lap.valid).toBeNull();
  });
});
