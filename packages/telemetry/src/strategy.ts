// Deterministic strategy review tool (F-09): stints, lap-time trend per stint, time lost around stops.
// Wording rules: "lap-time trend" (never "tyre wear"), "time lost around the stop" (never "pit stop duration").

import { isGreenLap } from './linuz90/convert.js';
import type { Compound, Lap, Session, TrackStatus } from './model.js';
import { linearFit, median } from './stats.js';

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const TREND_MIN_LAPS = 5;
const TREND_MIN_R2 = 0.3;

export interface StintReview {
  stintNumber: number;
  compound: Compound;
  compoundDetail: string | null;
  startLap: number;
  endLap: number | null;
  /** Seconds per lap the lap time changed over the stint's green laps (positive = getting slower). */
  lapTimeTrendSPerLap: number | null;
  /** How well a straight line fits those laps (0–1). Low values mean the trend isn't reliable. */
  trendR2: number | null;
  greenLapsUsed: number;
  /**
   * Whether the trend may be quoted: at least 5 green laps and r² of at least 0.3.
   * The AI gates use this; an unreportable trend stays visible in charts but isn't stated as a fact.
   */
  trendReportable: boolean;
  /** Laps left out of the trend, and why. */
  excludedLaps: { lap: number; reason: 'lap-1' | 'pit' | 'vsc' | 'sc' | 'red' | 'incomplete' }[];
  meanGreenLapS: number | null;
}

export interface StopReview {
  inLap: number;
  outLap: number | null;
  kind: 'stop' | 'pit-lane-visit';
  compoundBefore: Compound;
  compoundAfter: Compound;
  pitExcessS: number | null;
  underTrackStatus: TrackStatus;
  evidence: string;
}

export interface CarStrategy {
  carId: string;
  handle: string;
  isPlayer: boolean;
  grid: number | null;
  finish: number | null;
  result: string;
  medianGreenLapS: number | null;
  stints: StintReview[];
  stops: StopReview[];
}

const exclusion = (l: Lap): StintReview['excludedLaps'][number]['reason'] | null => {
  if (!l.complete) return 'incomplete';
  if (l.lapNumber === 1) return 'lap-1';
  if (l.pitIn || l.pitOut) return 'pit';
  if (l.trackStatus === 'vsc' || l.trackStatus === 'sc' || l.trackStatus === 'red')
    return l.trackStatus;
  return null;
};

export const reviewStrategy = (session: Session): CarStrategy[] =>
  [...session.cars]
    .sort((a, b) => (a.finalPosition ?? 99) - (b.finalPosition ?? 99))
    .map((car) => {
      const laps = session.laps.filter((l) => l.carId === car.id);
      const green = laps.filter(isGreenLap);
      const med = median(green.map((l) => (l.lapTimeMs as number) / 1000));
      const stints = session.stints
        .filter((s) => s.carId === car.id)
        .map((s): StintReview => {
          const inStint = laps.filter(
            (l) => l.lapNumber >= s.startLap && l.lapNumber <= (s.endLap ?? Infinity),
          );
          const used = inStint.filter(isGreenLap);
          const fit = linearFit(
            used.map((l) => l.lapNumber),
            used.map((l) => (l.lapTimeMs as number) / 1000),
          );
          return {
            stintNumber: s.stintNumber,
            compound: s.compound,
            compoundDetail: s.compoundDetail,
            startLap: s.startLap,
            endLap: s.endLap,
            lapTimeTrendSPerLap: fit ? r3(fit.slope) : null,
            trendR2: fit ? Math.round(fit.r2 * 100) / 100 : null,
            greenLapsUsed: used.length,
            trendReportable:
              fit !== null && used.length >= TREND_MIN_LAPS && fit.r2 >= TREND_MIN_R2,
            excludedLaps: inStint.flatMap((l) => {
              const reason = exclusion(l);
              return reason ? [{ lap: l.lapNumber, reason }] : [];
            }),
            meanGreenLapS: used.length
              ? r3(used.reduce((a, l) => a + (l.lapTimeMs as number) / 1000, 0) / used.length)
              : null,
          };
        });
      const stops = session.pitStops
        .filter((p) => p.carId === car.id)
        .map((p): StopReview => ({
          inLap: p.lap,
          outLap: p.outLap,
          kind: p.kind,
          compoundBefore: p.compoundBefore,
          compoundAfter: p.compoundAfter,
          pitExcessS: p.pitExcessS,
          underTrackStatus: p.underTrackStatus,
          evidence: p.evidence,
        }));
      return {
        carId: car.id,
        handle: car.handle,
        isPlayer: car.isPlayer,
        grid: car.gridPosition,
        finish: car.finalPosition,
        result: car.resultStatus,
        medianGreenLapS: med === null ? null : r3(med),
        stints,
        stops,
      };
    });
