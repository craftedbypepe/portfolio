/** Formats a lap time in milliseconds as m:ss.SSS, e.g. 78123 → "1:18.123". */
export const formatLapTime = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(`Invalid lap time: ${ms}`);
  }
  const rounded = Math.round(ms);
  const minutes = Math.floor(rounded / 60_000);
  const seconds = Math.floor((rounded % 60_000) / 1000);
  const millis = rounded % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};
