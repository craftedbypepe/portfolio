// Differences smaller than these are noise and must never be quoted (PRD v2, section 5; spikes 3 and 4).
export const NOISE_THRESHOLDS = {
  timeS: 0.03,
  speedKmh: 2,
  distanceM: 6,
} as const;

export type NoiseMetric = keyof typeof NOISE_THRESHOLDS;

export const isAboveNoise = (metric: NoiseMetric, delta: number): boolean =>
  Math.abs(delta) >= NOISE_THRESHOLDS[metric];
