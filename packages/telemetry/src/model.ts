import { z } from 'zod';

// Source-agnostic session model, schema v2 (SIE-20). Every converter produces this.
// Units: distance m, sessionTime s since the source's session start, lap/sector times ms,
// speed km/h, throttle and brake 0..1, gear -1..8 (0 = neutral).
// Unknown values are null: never guessed, never defaulted.

export const SCHEMA_VERSION = 2;

export const CompoundSchema = z.enum(['soft', 'medium', 'hard', 'inter', 'wet', 'unknown']);
export type Compound = z.infer<typeof CompoundSchema>;

export const LicenceSchema = z.object({
  licence: z.string(),
  credit: z.string(),
  url: z.string().nullable(),
  note: z.string().nullable(),
});

export const CarSchema = z.object({
  id: z.string(),
  /** Fictional handle. Real player names never appear in converted data. */
  handle: z.string(),
  raceNumber: z.number().int().nullable(),
  sourceTeamId: z.number().int().nullable(),
  isPlayer: z.boolean(),
  isAI: z.boolean().nullable(),
  gridPosition: z.number().int().nullable(),
  finalPosition: z.number().int().nullable(),
  resultStatus: z.enum(['finished', 'dnf', 'dsq', 'nc', 'retired', 'active', 'unknown']),
  /** "restricted": the player hid their telemetry, so their zeros are not measurements. */
  telemetryStatus: z.enum(['available', 'restricted', 'unknown']),
});
export type Car = z.infer<typeof CarSchema>;

export const LapCoverageSchema = z.object({
  firstM: z.number(),
  lastM: z.number(),
  largestGapM: z.number(),
  rawSamples: z.number().int(),
  rawRateHz: z.number().nullable(),
});

export const LapSchema = z.object({
  carId: z.string(),
  lapNumber: z.number().int().positive(),
  kind: z.enum(['out', 'flying', 'in', 'race', 'unknown']),
  complete: z.boolean(),
  startTime: z.number().nullable(),
  endTime: z.number().nullable(),
  lapTimeMs: z.number().int().nullable(),
  lapTimeSource: z.enum(['session-history', 'lap-data']).nullable(),
  /** Lap time from re-estimated line crossings, before pinning to official times (QA check). */
  derivedLapTimeMs: z.number().int().nullable(),
  sectorTimesMs: z.tuple([z.number().nullable(), z.number().nullable(), z.number().nullable()]),
  valid: z.boolean().nullable(),
  positionAtEnd: z.number().int().nullable(),
  compound: CompoundSchema,
  tyreAgeLaps: z.number().int().nullable(),
  pitIn: z.boolean(),
  coverage: LapCoverageSchema.nullable(),
  /** Relative path of the trace file, or null when the lap has no usable telemetry. */
  traceFile: z.string().nullable(),
});
export type Lap = z.infer<typeof LapSchema>;

/**
 * A lap on a fixed distance grid that includes both line crossings: d[i] = i * stepM, last point = lap length.
 * tau = seconds since the lap started, pinned to the official sector and lap times.
 */
export const LapTraceSchema = z.object({
  carId: z.string(),
  lapNumber: z.number().int().positive(),
  stepM: z.number().positive(),
  lengthM: z.number().positive(),
  distanceSource: z.enum(['native', 'estimated-from-speed']),
  anchoredTo: z.enum(['sectors', 'lap', 'none']),
  tau: z.array(z.number()),
  speed: z.array(z.number()),
  throttle: z.array(z.number()),
  brake: z.array(z.number()),
  gear: z.array(z.number().int()),
  x: z.array(z.number()),
  y: z.array(z.number()),
});
export type LapTrace = z.infer<typeof LapTraceSchema>;

export const StintSchema = z.object({
  carId: z.string(),
  stintNumber: z.number().int().positive(),
  compound: CompoundSchema,
  compoundDetail: z.string().nullable(),
  startLap: z.number().int(),
  endLap: z.number().int().nullable(),
  tyreAgeAtStart: z.number().int().nullable(),
});

export const PitStopSchema = z.object({
  carId: z.string(),
  lap: z.number().int(),
  /** "stop": the car stopped or changed tyres. "pit-lane-visit": drove through without a stop. */
  kind: z.enum(['stop', 'pit-lane-visit']),
  complete: z.boolean(),
  entryTime: z.number(),
  exitTime: z.number().nullable(),
  laneTimeS: z.number().nullable(),
  stationaryTimeS: z.number().nullable(),
  compoundBefore: CompoundSchema,
  compoundAfter: CompoundSchema,
});

export const SessionEventSchema = z.object({
  sessionTime: z.number(),
  type: z.string(),
  carId: z.string().nullable(),
  otherCarId: z.string().nullable(),
});

export const TimingTrackSchema = z.object({
  rateHz: z.number(),
  t: z.array(z.number()),
  cars: z.record(
    z.string(),
    z.object({
      position: z.array(z.number().int().nullable()),
      lap: z.array(z.number().int().nullable()),
      gapToLeaderMs: z.array(z.number().nullable()),
      inPit: z.array(z.boolean().nullable()),
    }),
  ),
});

export const SessionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  source: z.object({
    kind: z.enum(['f1-25-udp', 'linuz90-json', 'openf1']),
    sourceSessionId: z.string(),
    gameVersion: z.string().nullable(),
    distanceSource: z.enum(['native', 'estimated-from-speed']),
  }),
  licence: LicenceSchema,
  track: z.object({
    name: z.string().nullable(),
    sourceTrackId: z.string().nullable(),
    lengthM: z.number().nullable(),
    sectorStartsM: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  }),
  sessionType: z.enum([
    'practice',
    'qualifying',
    'sprint-shootout',
    'race',
    'time-trial',
    'unknown',
  ]),
  sessionTypeLabel: z.string().nullable(),
  totalLaps: z.number().int().nullable(),
  durationS: z.number(),
  playerCarId: z.string().nullable(),
  cars: z.array(CarSchema),
  laps: z.array(LapSchema),
  stints: z.array(StintSchema),
  pitStops: z.array(PitStopSchema),
  events: z.array(SessionEventSchema),
  timing: TimingTrackSchema,
  quality: z.object({ notes: z.array(z.string()) }),
});
export type Session = z.infer<typeof SessionSchema>;
