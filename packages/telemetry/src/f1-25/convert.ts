// Converter: a recording of F1 25 UDP packets → one Session (schema v2) plus lap traces per sessionUID.
// Ported from spike 2's adapter with the SIE-20 fixes (alignment, crossings, validity, provenance,
// restricted telemetry, pseudonymised names, string session IDs).

import {
  anchorTrace,
  cleanRaw,
  estimateCrossings,
  largestGap,
  traceFromRaw,
  type Anchor,
  type RawLap,
} from '../align.js';
import {
  SCHEMA_VERSION,
  type Car,
  type Compound,
  type Lap,
  type LapTrace,
  type Session,
  type TrackStatus,
} from '../model.js';
import { periodsFromLaps, worseStatus } from '../track-status.js';
import { handleFor } from '../pseudonym.js';
import { Bytes } from './bytes.js';
import { newContainerStats, readFrames, type ContainerStats } from './container.js';
import * as P from './packets.js';

export const RACEIQ_LICENCE: Session['licence'] = {
  licence: 'AGPL-3.0',
  credit: 'Data: F1 25 session recordings from SpeedHQ/RaceIQ (AGPL-3.0)',
  url: 'https://github.com/SpeedHQ/RaceIQ',
  note: 'Converted data. Player names replaced with fictional handles. No RaceIQ code is used.',
};

export interface ConvertOptions {
  /** Distance grid step for traces, default 5 m. */
  stepM?: number;
  /** Timing track rate, default 1 Hz. */
  timingRateHz?: number;
  /** Relative folder for trace files, default "laps". */
  traceDir?: string;
}

export interface ConvertedSession {
  session: Session;
  traces: LapTrace[];
}

const carId = (i: number): string => `car-${i}`;
const T_MAX = 1e6; // post-session packets carry FLT_MAX session times
const round = (v: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

const sessionTypeOf = (t: number): Session['sessionType'] => {
  if (t >= 1 && t <= 4) return 'practice';
  if (t >= 5 && t <= 9) return 'qualifying';
  if (t >= 10 && t <= 14) return 'sprint-shootout';
  if (t >= 15 && t <= 17) return 'race';
  if (t === 18) return 'time-trial';
  return 'unknown';
};
const compoundOf = (visual: number): Compound => P.VISUAL_COMPOUND[visual] ?? 'unknown';
// Session packet safety-car status: 0 none, 1 full SC, 2 VSC, 3 formation lap.
const TRACK_STATUS: Record<number, TrackStatus> = { 0: 'green', 1: 'sc', 2: 'vsc', 3: 'formation' };
const RESULT: Record<number, Car['resultStatus']> = {
  2: 'active',
  3: 'finished',
  4: 'dnf',
  5: 'dsq',
  6: 'nc',
  7: 'retired',
};
const EVENTS: Record<string, string> = {
  SSTA: 'session-start',
  SEND: 'session-end',
  LGOT: 'lights-out',
  CHQF: 'chequered-flag',
  RCWN: 'race-winner',
  FTLP: 'fastest-lap',
  OVTK: 'overtake',
  COLL: 'collision',
  PENA: 'penalty',
  RTMT: 'retirement',
  SCAR: 'safety-car',
  DRSE: 'drs-enabled',
  DRSD: 'drs-disabled',
  FLBK: 'flashback',
};

interface ClosedLap {
  lapNumber: number;
  complete: boolean;
  flagStart: number | null;
  flagEnd: number | null;
  lapDataTimeMs: number | null;
  lapDataSectorsMs: [number | null, number | null];
  invalidFlag: boolean | null;
  positionAtEnd: number | null;
  kind: Lap['kind'];
  compound: Compound;
  tyreAge: number | null;
  compoundDetail: string | null;
  trackStatus: TrackStatus;
  pitIn: boolean;
  raw: RawLap;
}

interface PitState {
  lap: number;
  entryTime: number;
  compoundBefore: Compound;
  laneMs: number;
  stopMs: number;
}

interface CarState {
  lapNum: number;
  lapStart: number | null;
  finished: boolean;
  prev: P.LapDataCar | null;
  prevT: number;
  statusVotes: number[];
  pitIn: boolean;
  compound: Compound;
  compoundDetail: string | null;
  age: number | null;
  lapCompound: Compound;
  lapAge: number | null;
  lapCompoundDetail: string | null;
  lapTrackStatus: TrackStatus;
  raw: RawLap;
  laps: ClosedLap[];
  pit: PitState | null;
  telemetryFrames: number;
  movingFrames: number;
}

interface Accumulator {
  uid: string;
  player: number;
  version: string;
  session: P.SessionInfo | null;
  participants: P.Participant[] | null;
  final: P.FinalClassificationCar[] | null;
  history: Map<number, P.SessionHistory>;
  cars: Map<number, CarState>;
  stints: Session['stints'];
  pits: Session['pitStops'];
  events: Session['events'];
  lapData: { frame: number; cars: P.LapDataCar[] } | null;
  motion: { frame: number; cars: P.CarMotion[] } | null;
  timing: NonNullable<Session['timing']>;
  nextTimingT: number;
  tFirst: number;
  tLast: number;
  regressions: number;
  grid: Map<number, number>;
  trackStatusNow: TrackStatus;
}

const emptyRaw = (): RawLap => ({
  t: [],
  d: [],
  speed: [],
  throttle: [],
  brake: [],
  gear: [],
  x: [],
  y: [],
});

export const convertF125Recording = (
  recording: Uint8Array,
  options: ConvertOptions = {},
): { sessions: ConvertedSession[]; container: ContainerStats } => {
  const stepM = options.stepM ?? 5;
  const rate = options.timingRateHz ?? 1;
  const traceDir = options.traceDir ?? 'laps';
  const container = newContainerStats();
  const accs = new Map<string, Accumulator>();

  const isActive = (a: Accumulator, i: number): boolean =>
    (a.lapData?.cars[i]?.resultStatus ?? 0) >= 2 || a.cars.has(i);

  const carState = (a: Accumulator, i: number): CarState => {
    let c = a.cars.get(i);
    if (!c) {
      c = {
        lapNum: 0,
        lapStart: null,
        finished: false,
        prev: null,
        prevT: 0,
        statusVotes: [0, 0, 0, 0, 0],
        pitIn: false,
        compound: 'unknown',
        compoundDetail: null,
        age: null,
        lapCompound: 'unknown',
        lapAge: null,
        lapCompoundDetail: null,
        lapTrackStatus: null,
        raw: emptyRaw(),
        laps: [],
        pit: null,
        telemetryFrames: 0,
        movingFrames: 0,
      };
      a.cars.set(i, c);
    }
    return c;
  };

  const closeLap = (
    a: Accumulator,
    c: CarState,
    endT: number | null,
    now: P.LapDataCar | null,
    complete: boolean,
  ): void => {
    if (c.lapNum < 1) return;
    const isRace = sessionTypeOf(a.session?.sessionType ?? 0) === 'race';
    const votes = c.statusVotes;
    const status = votes.indexOf(Math.max(...votes));
    const kind: Lap['kind'] = isRace
      ? 'race'
      : status === 1
        ? 'flying'
        : status === 2
          ? 'in'
          : status === 3
            ? 'out'
            : 'unknown';
    const p = c.prev;
    c.laps.push({
      lapNumber: c.lapNum,
      complete,
      flagStart: c.lapStart,
      flagEnd: endT,
      lapDataTimeMs: complete && now && now.lastLapTimeMs > 0 ? now.lastLapTimeMs : null,
      lapDataSectorsMs: [
        p && p.sector1Ms > 0 ? p.sector1Ms : null,
        p && p.sector2Ms > 0 ? p.sector2Ms : null,
      ],
      invalidFlag: p ? p.lapInvalid === 1 : null,
      positionAtEnd: now?.position || null,
      kind,
      compound: c.lapCompound,
      tyreAge: c.lapAge,
      compoundDetail: c.lapCompoundDetail,
      trackStatus: c.lapTrackStatus,
      pitIn: c.pitIn,
      raw: c.raw,
    });
  };

  for (const frame of readFrames(recording, container)) {
    const b = new Bytes(frame.data);
    if (!P.isF125Packet(b)) continue;
    const h = P.parseHeader(b);
    if (h.sessionUid === '0') continue; // lobby or results screen
    let a = accs.get(h.sessionUid);
    if (!a) {
      a = {
        uid: h.sessionUid,
        player: h.playerCarIndex,
        version: h.gameVersion,
        session: null,
        participants: null,
        final: null,
        history: new Map(),
        cars: new Map(),
        stints: [],
        pits: [],
        events: [],
        lapData: null,
        motion: null,
        timing: { rateHz: rate, t: [], cars: {} },
        nextTimingT: 0,
        tFirst: Infinity,
        tLast: 0,
        regressions: 0,
        trackStatusNow: null,
        grid: new Map(),
      };
      accs.set(h.sessionUid, a);
    }
    const acc = a;
    const t = h.sessionTime;
    if (!(t >= 0 && t < T_MAX)) continue;
    acc.tFirst = Math.min(acc.tFirst, t);
    acc.tLast = Math.max(acc.tLast, t);

    switch (h.packetId) {
      case 1: {
        const info = P.parseSession(b);
        acc.session ??= info;
        acc.trackStatusNow = TRACK_STATUS[info.safetyCarStatus] ?? null;
        break;
      }
      case 4:
        acc.participants = P.parseParticipants(b).cars;
        break;
      case 8:
        acc.final = P.parseFinalClassification(b);
        break;
      case 11: {
        const sh = P.parseSessionHistory(b);
        acc.history.set(sh.carIdx, sh);
        break;
      }
      case 0:
        acc.motion = { frame: h.frameId, cars: P.parseMotion(b) };
        break;
      case 3: {
        const e = P.parseEvent(b);
        const type = EVENTS[e.code];
        if (!type) break;
        acc.events.push({
          sessionTime: round(t, 3),
          type,
          carId: e.vehicleIdx !== null && e.vehicleIdx < P.MAX_CARS ? carId(e.vehicleIdx) : null,
          otherCarId:
            e.otherVehicleIdx !== null && e.otherVehicleIdx < P.MAX_CARS
              ? carId(e.otherVehicleIdx)
              : null,
          lap: null,
          detail: null,
        });
        break;
      }
      case 7: {
        P.parseCarStatus(b).forEach((s, i) => {
          if (!isActive(acc, i) || !s.visualCompound) return;
          const c = carState(acc, i);
          const comp = compoundOf(s.visualCompound);
          if (c.compound !== comp) {
            const open = acc.stints.findLast((x) => x.carId === carId(i) && x.endLap === null);
            if (open) open.endLap = Math.max(open.startLap, c.lapNum - (c.pitIn ? 0 : 1));
            acc.stints.push({
              carId: carId(i),
              stintNumber: (open?.stintNumber ?? 0) + 1,
              compound: comp,
              compoundDetail: P.ACTUAL_COMPOUND[s.actualCompound] ?? null,
              startLap: Math.max(1, c.lapNum),
              endLap: null,
              tyreAgeAtStart: s.tyresAgeLaps,
            });
          }
          if (c.lapCompound === 'unknown') {
            c.lapCompound = comp;
            c.lapAge = s.tyresAgeLaps;
          }
          c.compound = comp;
          c.compoundDetail = P.ACTUAL_COMPOUND[s.actualCompound] ?? null;
          c.age = s.tyresAgeLaps;
        });
        break;
      }
      case 2: {
        const cars = P.parseLapData(b);
        acc.lapData = { frame: h.frameId, cars };
        cars.forEach((ld, i) => {
          if (!isActive(acc, i)) return;
          const c = carState(acc, i);
          if (ld.gridPosition) acc.grid.set(i, ld.gridPosition);
          if (c.finished) {
            c.prev = ld;
            c.prevT = t;
            return;
          }
          if (t < c.prevT) {
            // flashback: drop the rewound part of the current lap
            acc.regressions++;
            const keep = c.raw.t.findIndex((x) => x >= t);
            if (keep >= 0)
              for (const k of Object.keys(c.raw) as (keyof RawLap)[])
                c.raw[k] = c.raw[k].slice(0, keep);
          }
          if (ld.currentLapNum !== c.lapNum) {
            const L = acc.session?.trackLengthM ?? 0;
            let endT = t;
            if (c.prev && L > 0 && ld.currentLapNum === c.lapNum + 1) {
              const before = L - c.prev.lapDistance;
              const after = ld.lapDistance;
              if (before >= 0 && after >= 0 && before + after > 0)
                endT = c.prevT + (t - c.prevT) * (before / (before + after));
            }
            closeLap(acc, c, endT, ld, ld.currentLapNum === c.lapNum + 1);
            c.lapNum = ld.currentLapNum;
            c.lapStart = c.lapNum === 1 ? t : endT;
            c.raw = emptyRaw();
            c.statusVotes = [0, 0, 0, 0, 0];
            c.pitIn = false;
            c.lapCompound = c.compound;
            c.lapCompoundDetail = c.compoundDetail;
            c.lapTrackStatus = acc.trackStatusNow;
            c.lapAge = c.age;
          } else if (c.prev && c.prev.resultStatus !== 3 && ld.resultStatus === 3) {
            closeLap(acc, c, t, ld, true); // finished: the game keeps currentLapNum on the final lap
            c.finished = true;
          }
          c.statusVotes[ld.driverStatus] = (c.statusVotes[ld.driverStatus] ?? 0) + 1;
          c.lapTrackStatus = worseStatus(c.lapTrackStatus, acc.trackStatusNow);
          const wasIn = (c.prev?.pitStatus ?? 0) > 0;
          const isIn = ld.pitStatus > 0;
          if (!wasIn && isIn && c.prev) {
            c.pitIn = true;
            c.pit = {
              lap: ld.currentLapNum,
              entryTime: round(t, 3),
              compoundBefore: c.compound,
              laneMs: 0,
              stopMs: 0,
            };
          }
          if (isIn && c.pit) {
            c.pit.laneMs = Math.max(c.pit.laneMs, ld.pitLaneTimeMs);
            c.pit.stopMs = Math.max(c.pit.stopMs, ld.pitStopTimerMs);
          }
          if (wasIn && !isIn && c.pit) {
            const changed = c.compound !== c.pit.compoundBefore;
            const stopped = c.pit.stopMs > 0 || changed;
            acc.pits.push({
              carId: carId(i),
              lap: c.pit.lap,
              kind: stopped ? 'stop' : 'pit-lane-visit',
              complete: true,
              entryTime: c.pit.entryTime,
              exitTime: round(t, 3),
              laneTimeS: c.pit.laneMs ? c.pit.laneMs / 1000 : round(t - c.pit.entryTime, 3),
              stationaryTimeS: c.pit.stopMs ? c.pit.stopMs / 1000 : null,
              compoundBefore: c.pit.compoundBefore,
              compoundAfter: changed ? c.compound : c.pit.compoundBefore,
              outLap: ld.currentLapNum,
              pitExcessS: null,
              underTrackStatus: null,
              entryToTyreChangeS: null,
              evidence: stopped
                ? 'lap-data pit stop timer or tyre change'
                : 'lap-data pit status only',
            });
            c.pit = null;
          }
          c.prev = ld;
          c.prevT = t;
        });
        if (t >= acc.nextTimingT) {
          acc.timing.t.push(round(t, 3));
          const k = acc.timing.t.length - 1;
          cars.forEach((ld, i) => {
            if (!isActive(acc, i)) return;
            const tc = (acc.timing.cars[carId(i)] ??= {
              position: [],
              lap: [],
              gapToLeaderMs: [],
              inPit: [],
            });
            while (tc.position.length < k) {
              tc.position.push(null);
              tc.lap.push(null);
              tc.gapToLeaderMs.push(null);
              tc.inPit.push(null);
            }
            tc.position.push(ld.position || null);
            tc.lap.push(ld.currentLapNum || null);
            tc.gapToLeaderMs.push(ld.position === 1 ? 0 : ld.deltaToLeaderMs || null);
            tc.inPit.push(ld.pitStatus > 0);
          });
          acc.nextTimingT = Math.floor(t * rate + 1) / rate;
        }
        break;
      }
      case 6: {
        if (!acc.lapData || !acc.motion) break;
        const ldCars = acc.lapData.cars;
        const moCars = acc.motion.cars;
        P.parseCarTelemetry(b).forEach((tel, i) => {
          if (!isActive(acc, i)) return;
          const c = carState(acc, i);
          const ld = ldCars[i];
          const mo = moCars[i];
          if (c.lapNum < 1 || c.finished || !ld || !mo) return;
          c.telemetryFrames++;
          if (tel.speedKmh > 0 || tel.throttle > 0) c.movingFrames++;
          c.raw.t.push(t);
          c.raw.d.push(ld.lapDistance);
          c.raw.speed.push(tel.speedKmh);
          c.raw.throttle.push(tel.throttle);
          c.raw.brake.push(tel.brake);
          c.raw.gear.push(tel.gear);
          c.raw.x.push(mo.x);
          c.raw.y.push(mo.z);
        });
        break;
      }
    }
  }

  const sessions: ConvertedSession[] = [];
  for (const a of accs.values()) {
    if (!a.session) continue;
    sessions.push(finalise(a, { stepM, traceDir }));
  }
  return { sessions, container };

  function finalise(a: Accumulator, o: { stepM: number; traceDir: string }): ConvertedSession {
    const s = a.session as P.SessionInfo;
    const L = s.trackLengthM;
    const sectorStarts: [number, number, number] = [
      0,
      round(s.sector2StartM, 3),
      round(s.sector3StartM, 3),
    ];
    const notes: string[] = [];
    for (const c of a.cars.values()) {
      if (c.lapNum >= 1 && !c.finished) closeLap(a, c, null, null, false);
      if (c.pit) {
        a.pits.push({
          carId: carId([...a.cars.entries()].find(([, v]) => v === c)?.[0] ?? -1),
          lap: c.pit.lap,
          kind: c.pit.stopMs > 0 ? 'stop' : 'pit-lane-visit',
          complete: false,
          entryTime: c.pit.entryTime,
          exitTime: null,
          laneTimeS: null,
          stationaryTimeS: null,
          compoundBefore: c.pit.compoundBefore,
          compoundAfter: 'unknown',
          outLap: null,
          pitExcessS: null,
          underTrackStatus: null,
          entryToTyreChangeS: null,
          evidence: 'recording ended in the pit lane',
        });
      }
    }

    const cars: Car[] = [];
    const laps: Lap[] = [];
    const traces: LapTrace[] = [];
    let derivedChecks = 0;
    let settingRestrictedButPopulated = 0;
    let derivedMaxErrMs = 0;

    for (const i of [...a.cars.keys()].sort((x, y) => x - y)) {
      const c = a.cars.get(i) as CarState;
      const part = a.participants?.[i];
      const fc = a.final?.[i];
      const ldNow = a.lapData?.cars[i];
      const isPlayer = i === a.player;
      // Judged from the data: the UDP "restricted" setting doesn't zero speed, inputs or position in F1 25,
      // so a car counts as restricted only when its telemetry is (almost) all zeros.
      const movingShare = c.telemetryFrames > 0 ? c.movingFrames / c.telemetryFrames : 0;
      const telemetryStatus: Car['telemetryStatus'] =
        c.telemetryFrames === 0 ? 'unknown' : movingShare >= 0.5 ? 'available' : 'restricted';
      if (part && !part.telemetryPublic && telemetryStatus === 'available' && !isPlayer) {
        settingRestrictedButPopulated++;
      }
      cars.push({
        id: carId(i),
        handle: handleFor(i),
        raceNumber: part?.raceNumber ?? null,
        sourceTeamId: part?.teamId ?? null,
        isPlayer,
        isAI: part ? part.aiControlled : null,
        gridPosition: fc?.gridPosition || a.grid.get(i) || null,
        finalPosition: fc?.position || ldNow?.position || null,
        resultStatus: RESULT[fc?.resultStatus ?? ldNow?.resultStatus ?? 0] ?? 'unknown',
        telemetryStatus,
        totalRaceTimeS: null,
        penaltiesS: null,
      });

      const history = a.history.get(i);
      for (const cl of c.laps) {
        const hl = history?.laps[cl.lapNumber - 1];
        let lapTimeMs: number | null = null;
        let lapTimeSource: Lap['lapTimeSource'] = null;
        let sectors: Lap['sectorTimesMs'] = [cl.lapDataSectorsMs[0], cl.lapDataSectorsMs[1], null];
        let valid: boolean | null = null;
        let complete = cl.complete;
        if (hl && hl.lapTimeMs > 0) {
          lapTimeMs = hl.lapTimeMs;
          lapTimeSource = 'session-history';
          sectors = [hl.s1Ms || null, hl.s2Ms || null, hl.s3Ms || null];
          valid = (hl.validFlags & 1) === 1;
          if (!complete) {
            complete = true;
            notes.push(`${carId(i)} lap ${cl.lapNumber}: closed by Session History only`);
          }
        } else if (cl.lapDataTimeMs) {
          lapTimeMs = cl.lapDataTimeMs;
          lapTimeSource = 'lap-data';
          const [s1, s2] = cl.lapDataSectorsMs;
          sectors = [s1, s2, s1 && s2 ? lapTimeMs - s1 - s2 : null];
          valid = cl.invalidFlag === null ? null : !cl.invalidFlag;
        }

        const cleaned = L > 0 ? cleanRaw(cl.raw, L) : null;
        const coverage =
          cleaned && cleaned.d.length > 0
            ? {
                firstM: round(cleaned.d[0] ?? 0, 1),
                lastM: round(cleaned.d[cleaned.d.length - 1] ?? 0, 1),
                largestGapM: round(largestGap(cleaned.d, L), 1),
                rawSamples: cleaned.d.length,
                rawRateHz:
                  cleaned.t.length > 1
                    ? round(
                        (cleaned.t.length - 1) /
                          ((cleaned.t[cleaned.t.length - 1] ?? 0) - (cleaned.t[0] ?? 0)),
                        2,
                      )
                    : null,
              }
            : null;
        const crossing =
          cleaned && complete
            ? estimateCrossings(cleaned, L, { startT: cl.flagStart, endT: cl.flagEnd })
            : null;
        const derivedLapTimeMs = crossing
          ? Math.round((crossing.endT - crossing.startT) * 1000)
          : null;
        if (derivedLapTimeMs !== null && lapTimeMs !== null && cl.lapNumber > 1) {
          derivedChecks++;
          derivedMaxErrMs = Math.max(derivedMaxErrMs, Math.abs(derivedLapTimeMs - lapTimeMs));
        }

        let traceFile: string | null = null;
        const usable =
          telemetryStatus === 'available' &&
          cleaned &&
          crossing &&
          coverage &&
          coverage.largestGapM < 100;
        if (usable) {
          const anchors: Anchor[] = [];
          let anchoredTo: LapTrace['anchoredTo'] = 'none';
          const [s1, s2] = sectors;
          if (lapTimeMs !== null && s1 && s2) {
            anchors.push(
              { d: sectorStarts[1], t: s1 / 1000 },
              { d: sectorStarts[2], t: (s1 + s2) / 1000 },
              { d: L, t: lapTimeMs / 1000 },
            );
            anchoredTo = 'sectors';
          } else if (lapTimeMs !== null) {
            anchors.push({ d: L, t: lapTimeMs / 1000 });
            anchoredTo = 'lap';
          }
          const tr = anchorTrace(traceFromRaw(cleaned, L, o.stepM, crossing), anchors);
          traceFile = `${o.traceDir}/${carId(i)}-lap-${cl.lapNumber}.json`;
          traces.push({
            carId: carId(i),
            lapNumber: cl.lapNumber,
            stepM: o.stepM,
            lengthM: L,
            distanceSource: 'native',
            anchoredTo,
            tau: tr.tau.map((v) => round(v, 3)),
            speed: tr.speed.map((v) => round(v, 1)),
            throttle: tr.throttle.map((v) => round(v, 3)),
            brake: tr.brake.map((v) => round(v, 3)),
            gear: tr.gear.map((v) => Math.round(v)),
            x: tr.x.map((v) => round(v, 1)),
            y: tr.y.map((v) => round(v, 1)),
          });
        }

        laps.push({
          carId: carId(i),
          lapNumber: cl.lapNumber,
          kind: cl.kind,
          complete,
          startTime: crossing
            ? round(crossing.startT, 3)
            : cl.flagStart !== null
              ? round(cl.flagStart, 3)
              : null,
          endTime: crossing
            ? round(crossing.endT, 3)
            : cl.flagEnd !== null
              ? round(cl.flagEnd, 3)
              : null,
          lapTimeMs,
          lapTimeSource,
          derivedLapTimeMs,
          sectorTimesMs: sectors,
          valid,
          positionAtEnd: cl.positionAtEnd,
          compound: cl.compound,
          compoundDetail: cl.compoundDetail,
          tyreAgeLaps: cl.tyreAge,
          pitIn: cl.pitIn || a.pits.some((p) => p.carId === carId(i) && p.lap === cl.lapNumber),
          pitOut: a.pits.some((p) => p.carId === carId(i) && p.outLap === cl.lapNumber),
          trackStatus: cl.trackStatus,
          gapToAheadMs: null,
          gapToLeaderMs: null,
          coverage,
          traceFile,
        });
      }
    }

    if (!a.final)
      notes.push(
        'No final classification in the recording: final positions come from the last lap data.',
      );
    if (a.events.length === 0) notes.push('No event packets in the recording for this session.');
    if (a.regressions)
      notes.push(
        `Session time went backwards ${a.regressions} times (flashbacks); rewound samples were dropped.`,
      );
    const restricted = cars.filter((c) => c.telemetryStatus === 'restricted').length;
    if (restricted)
      notes.push(
        `${restricted} car(s) have restricted telemetry: no traces, their zeros are not measurements.`,
      );
    if (settingRestrictedButPopulated) {
      notes.push(
        `${settingRestrictedButPopulated} car(s) have the game's telemetry setting on "restricted", but speed, inputs and position are populated; setup and fuel fields may be hidden.`,
      );
    }
    notes.push(
      `Line-crossing check: ${derivedChecks} laps, largest difference from official lap time ${derivedMaxErrMs} ms (before pinning).`,
    );

    const st = s.sessionType;
    const type = sessionTypeOf(st);
    const session: Session = {
      schemaVersion: SCHEMA_VERSION,
      id: `f1-25:${a.uid}`,
      source: {
        kind: 'f1-25-udp',
        sourceSessionId: a.uid,
        gameVersion: a.version,
        distanceSource: 'native',
      },
      licence: RACEIQ_LICENCE,
      track: {
        name: P.TRACKS[s.trackId] ?? null,
        sourceTrackId: String(s.trackId),
        lengthM: L || null,
        sectorStartsM: L ? sectorStarts : null,
      },
      sessionType: type,
      sessionTypeLabel: P.SESSION_TYPES[st] ?? null,
      totalLaps: type === 'race' ? s.totalLaps : null,
      durationS: round(a.tLast - a.tFirst, 3),
      playerCarId: carId(a.player),
      cars,
      laps,
      stints: a.stints,
      pitStops: a.pits,
      events: a.events.sort((x, y) => x.sessionTime - y.sessionTime),
      timing: a.timing,
      lapTiming: null,
      trackStatusPeriods: periodsFromLaps(laps.filter((l) => l.carId === carId(a.player))),
      weather: null,
      quality: { notes },
    };
    return { session, traces };
  }
};
