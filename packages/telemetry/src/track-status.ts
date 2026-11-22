// Track status helpers shared by the converters.
import type { Lap, Session, TrackStatus } from './model.js';

const RANK: Record<NonNullable<TrackStatus>, number> = {
  green: 0,
  formation: 1,
  vsc: 2,
  sc: 3,
  red: 4,
};

/** The more severe of two statuses; null only when both are unknown. */
export const worseStatus = (a: TrackStatus, b: TrackStatus): TrackStatus => {
  if (a === null) return b;
  if (b === null) return a;
  return RANK[b] > RANK[a] ? b : a;
};

/** Consecutive laps under VSC, SC or red flag, from one car's laps (usually the leader or the player). */
export const periodsFromLaps = (
  laps: readonly Pick<Lap, 'lapNumber' | 'trackStatus'>[],
): Session['trackStatusPeriods'] => {
  const out: Session['trackStatusPeriods'] = [];
  for (const lap of [...laps].sort((x, y) => x.lapNumber - y.lapNumber)) {
    const s = lap.trackStatus;
    if (s !== 'vsc' && s !== 'sc' && s !== 'red') continue;
    const last = out[out.length - 1];
    if (last && last.status === s && last.toLap === lap.lapNumber - 1) last.toLap = lap.lapNumber;
    else out.push({ status: s, fromLap: lap.lapNumber, toLap: lap.lapNumber });
  }
  return out;
};
