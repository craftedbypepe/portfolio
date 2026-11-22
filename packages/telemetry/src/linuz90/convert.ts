// Converter: linuz90/f1-telemetry-viewer race export (JSON, 2025 and 2026 formats) → Session (schema v2).
// Lap-level data only: official lap and sector times, positions, stints, pit stops, race control.
// Ported from spike 2c with the SIE-20 fixes: fictional handles for every car, compounds taken from
// lap history (the 2026 tyre-change messages swap old and new), pit messages de-duplicated per car
// and lap, stops under VSC/SC flagged, gaps never backfilled, "time lost around the stop" naming.

import { median } from '../stats.js';
import {
  SCHEMA_VERSION,
  type Car,
  type Compound,
  type Lap,
  type LapTiming,
  type Session,
  type TrackStatus,
} from '../model.js';
import { handleFor } from '../pseudonym.js';
import { periodsFromLaps, worseStatus } from '../track-status.js';

export const LINUZ90_LICENCE: Session['licence'] = {
  licence: 'MIT',
  credit: 'Data: linuz90/f1-telemetry-viewer (MIT)',
  url: 'https://github.com/linuz90/f1-telemetry-viewer',
  note: 'Converted lap-level data. Player names replaced with fictional handles; team names removed.',
};

/* eslint-disable @typescript-eslint/no-explicit-any -- the export is untyped JSON; every read is validated below */
type Json = any;

const COMPOUND: Record<string, Compound> = {
  Soft: 'soft',
  Medium: 'medium',
  Hard: 'hard',
  Inters: 'inter',
  Intermediate: 'inter',
  Wet: 'wet',
};
const STATUS: Record<string, TrackStatus> = {
  NO_SAFETY_CAR: 'green',
  VIRTUAL_SAFETY_CAR: 'vsc',
  FULL_SAFETY_CAR: 'sc',
  FORMATION_LAP: 'formation',
  RED_FLAG: 'red',
};
const RESULT: Record<string, Car['resultStatus']> = {
  FINISHED: 'finished',
  DID_NOT_FINISH: 'dnf',
  DISQUALIFIED: 'dsq',
  NOT_CLASSIFIED: 'nc',
  RETIRED: 'retired',
  ACTIVE: 'active',
};
const EVENTS: Record<string, string> = {
  LIGHTS_OUT: 'lights-out',
  OVERTAKE: 'overtake',
  COLLISION: 'collision',
  PENALTY: 'penalty',
  SAFETY_CAR: 'safety-car',
  RETIREMENT: 'retirement',
  FASTEST_LAP: 'fastest-lap',
  RACE_WINNER: 'race-winner',
  CHEQUERED_FLAG: 'chequered-flag',
  CAR_DAMAGE: 'damage',
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const compound = (v: unknown): Compound =>
  typeof v === 'string' ? (COMPOUND[v] ?? 'unknown') : 'unknown';
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const carId = (index: number): string => `car-${index}`;

/** A lap counts as green when it is complete, not lap 1, not an in- or out-lap, and not under VSC/SC. */
export const isGreenLap = (l: Lap): boolean =>
  l.complete &&
  l.lapNumber > 1 &&
  !l.pitIn &&
  !l.pitOut &&
  (l.trackStatus === 'green' || l.trackStatus === null);

export interface Linuz90Input {
  /** The raw file text: the 64-bit session UID is read from it as text, never as a JS number. */
  text: string;
  /** File name, used when the export has no session UID. */
  fileName: string;
}

export const convertLinuz90 = ({ text, fileName }: Linuz90Input): Session => {
  const d: Json = JSON.parse(text);
  const si: Json = d['session-info'] ?? {};
  const format = String(d['packet-format']) === '2026' ? '2026' : '2025';
  const uidText = /"session-uid"\s*:\s*"?([0-9.eE+-]+)/.exec(text)?.[1] ?? null;
  const notes: string[] = [
    `Source format ${format}. Lap-level export: no continuous telemetry, no traces.`,
  ];
  const cd: Json[] = Array.isArray(d['classification-data']) ? d['classification-data'] : [];
  const rc: Json[] = Array.isArray(d['race-control']) ? d['race-control'] : [];
  const indexByName = new Map<string, number>(
    cd.map((c) => [c['driver-name'] as string, c.index as number]),
  );
  const idOf = (index: unknown, name?: unknown): string | null => {
    if (typeof index === 'number' && index >= 0 && index < 22) return carId(index);
    if (typeof name === 'string' && indexByName.has(name))
      return carId(indexByName.get(name) as number);
    return null;
  };
  const lightsOut = num(rc.find((m) => m['message-type'] === 'LIGHTS_OUT')?.timestamp);
  const rcTime = (m: Json): number | null =>
    lightsOut === null || num(m.timestamp) === null ? null : r3(m.timestamp - lightsOut);

  const positions = new Map<string, (number | null)[]>();
  for (const p of d['position-history'] ?? []) {
    const id = idOf(null, p.name);
    if (!id) continue;
    const arr: (number | null)[] = [];
    for (const x of p['driver-position-history'] ?? []) arr[x['lap-number']] = num(x.position);
    positions.set(id, arr);
  }

  const cars: Car[] = [];
  const laps: Lap[] = [];
  const stints: Session['stints'] = [];
  const pitStops: Session['pitStops'] = [];
  const lapsByCar = new Map<string, Lap[]>();

  for (const c of cd) {
    const id = carId(c.index);
    const fc: Json = c['final-classification'] ?? {};
    const pd: Json = c['participant-data'] ?? {};
    const tel = c['telemetry-settings'] ?? pd['telemetry-setting'];
    cars.push({
      id,
      handle: handleFor(c.index),
      raceNumber: num(pd['race-number']),
      sourceTeamId: null,
      isPlayer: c['is-player'] === true,
      isAI: typeof pd['ai-controlled'] === 'boolean' ? pd['ai-controlled'] : null,
      gridPosition: num(fc['grid-position']),
      finalPosition: num(fc.position),
      resultStatus: RESULT[fc['result-status']] ?? 'unknown',
      telemetryStatus:
        tel === 'Public' ? 'available' : tel === 'Restricted' ? 'restricted' : 'unknown',
      totalRaceTimeS: num(fc['total-race-time']),
      penaltiesS: num(fc['penalties-time']),
    });

    // Laps: official lap times; session time = cumulative race time (t = 0 at lights out).
    const lth = c['lap-time-history']?.['lap-history-data'];
    const lapTimeSource: Lap['lapTimeSource'] = lth ? 'lap-time-history' : 'session-history';
    const history: Json[] = lth ?? c['session-history']?.['lap-history-data'] ?? [];
    const perLap: Json[] = [];
    for (const p of c['per-lap-info'] ?? []) perLap[p['lap-number']] = p;
    const pos = positions.get(id) ?? [];
    const carLaps: Lap[] = [];
    let t = 0;
    history.forEach((l, i) => {
      const n = i + 1;
      const ms = num(l['lap-time-in-ms']);
      const complete = ms !== null && ms > 0;
      const sector = (k: number): number | null => {
        const v = num(l[`sector-${k}-time-in-ms`]);
        return v === null || v === 0
          ? null
          : v + (num(l[`sector-${k}-time-minutes`]) ?? 0) * 60_000;
      };
      const tyres = l['tyre-set-info']?.['tyre-set'];
      const flags = num(l['lap-valid-bit-flags']);
      const start = t;
      if (complete) t += (ms as number) / 1000;
      carLaps.push({
        carId: id,
        lapNumber: n,
        kind: 'race',
        complete,
        startTime: r3(start),
        endTime: complete ? r3(t) : null,
        lapTimeMs: complete ? ms : null,
        lapTimeSource: complete ? lapTimeSource : null,
        derivedLapTimeMs: null,
        sectorTimesMs: [sector(1), sector(2), sector(3)],
        valid: flags === null ? null : (flags & 1) === 1,
        positionAtEnd: complete ? (pos[n] ?? null) : null,
        compound: tyres ? compound(tyres['visual-tyre-compound']) : 'unknown',
        compoundDetail: str(tyres?.['actual-tyre-compound']),
        tyreAgeLaps: num(perLap[n]?.['car-status-data']?.['tyres-age-laps']),
        pitIn: false,
        pitOut: false,
        trackStatus: STATUS[perLap[n]?.['max-safety-car-status']] ?? null,
        gapToAheadMs: null,
        gapToLeaderMs: null,
        coverage: null,
        traceFile: null,
      });
    });
    laps.push(...carLaps);
    lapsByCar.set(id, carLaps);
    const lastLap = carLaps.length;

    // Stints: tyre-set history; fallback final classification (its end laps are one lower: end = value + 1).
    const carStints: Session['stints'] = [];
    const tsh: Json[] = c['tyre-set-history'] ?? [];
    if (tsh.length) {
      tsh.forEach((s, k) => {
        const sd = s['tyre-set-data'] ?? {};
        carStints.push({
          carId: id,
          stintNumber: k + 1,
          compound: compound(sd['visual-tyre-compound']),
          compoundDetail: str(sd['actual-tyre-compound']),
          startLap: s['start-lap'],
          endLap: Math.min(s['end-lap'], lastLap),
          tyreAgeAtStart: num(perLap[s['start-lap']]?.['car-status-data']?.['tyres-age-laps']),
        });
      });
    } else if (Array.isArray(fc['tyre-stints-end-laps'])) {
      let start = 1;
      (fc['tyre-stints-end-laps'] as number[]).forEach((e, k) => {
        if (start > lastLap) return;
        const end = e === 255 ? lastLap : Math.min(e + 1, lastLap);
        carStints.push({
          carId: id,
          stintNumber: k + 1,
          compound: compound(fc['tyre-stints-visual']?.[k]),
          compoundDetail: str(fc['tyre-stints-actual']?.[k]),
          startLap: start,
          endLap: end,
          tyreAgeAtStart: num(perLap[start]?.['car-status-data']?.['tyres-age-laps']),
        });
        start = end + 1;
      });
      notes.push(
        `${handleFor(c.index)}: no tyre-set history (telemetry ${String(tel)}); stints from the final classification.`,
      );
    }
    // Laps without tyre info (restricted telemetry) take the compound from their stint.
    for (const s of carStints) {
      for (let n = s.startLap; n <= (s.endLap ?? lastLap); n++) {
        const l = carLaps[n - 1];
        if (l && l.compound === 'unknown') {
          l.compound = s.compound;
          l.compoundDetail = s.compoundDetail;
        }
      }
    }
    stints.push(...carStints);

    // Pit stops.
    const before = (lap: number): Compound => carLaps[lap - 1]?.compound ?? 'unknown';
    if (rc.length) {
      const mine = rc
        .filter(
          (m) =>
            (m['message-type'] === 'PITTING' || m['message-type'] === 'TYRE_CHANGE') &&
            m['involved-drivers']?.[0] === c.index,
        )
        .sort((a, b) => a.timestamp - b.timestamp);
      // De-duplicate pit entries per lap (the 2026 export can repeat a PITTING message).
      const entries = mine.filter(
        (m, k) =>
          m['message-type'] === 'PITTING' &&
          !mine
            .slice(0, k)
            .some((o) => o['message-type'] === 'PITTING' && o['lap-number'] === m['lap-number']),
      );
      entries.forEach((p, k) => {
        const next = entries[k + 1]?.timestamp ?? Infinity;
        const change = mine.find(
          (m) =>
            m['message-type'] === 'TYRE_CHANGE' && m.timestamp > p.timestamp && m.timestamp < next,
        );
        const inLap = p['lap-number'] as number;
        const stintAfter = carStints.find((s) => s.startLap === inLap + 1);
        const complete = Boolean(change) || Boolean(stintAfter);
        pitStops.push({
          carId: id,
          lap: inLap,
          kind: complete ? 'stop' : 'pit-lane-visit',
          complete: true,
          outLap: inLap + 1 <= lastLap ? inLap + 1 : null,
          entryTime: rcTime(p),
          exitTime: null,
          laneTimeS: null,
          stationaryTimeS: null,
          compoundBefore: before(inLap),
          // From lap history, not the message: 2026 tyre-change messages swap old and new.
          compoundAfter: complete
            ? (carLaps[inLap]?.compound ?? stintAfter?.compound ?? 'unknown')
            : before(inLap),
          pitExcessS: null,
          underTrackStatus: null,
          entryToTyreChangeS: change ? r3(change.timestamp - p.timestamp) : null,
          evidence: change
            ? 'race-control TYRE_CHANGE'
            : stintAfter
              ? 'stint change (no TYRE_CHANGE message: restricted telemetry)'
              : 'pit entry only (no tyre or stint change)',
        });
      });
      const dupes = mine.filter((m) => m['message-type'] === 'PITTING').length - entries.length;
      if (dupes > 0)
        notes.push(`${handleFor(c.index)}: ${dupes} repeated pit-entry message(s) removed.`);
    } else {
      for (const s of carStints.slice(1)) {
        const inLap = s.startLap - 1;
        pitStops.push({
          carId: id,
          lap: inLap,
          kind: 'stop',
          complete: true,
          outLap: s.startLap,
          entryTime: carLaps[inLap - 1]?.endTime ?? null,
          exitTime: null,
          laneTimeS: null,
          stationaryTimeS: null,
          compoundBefore: before(inLap),
          compoundAfter: s.compound,
          pitExcessS: null,
          underTrackStatus: null,
          entryToTyreChangeS: null,
          evidence: 'tyre set change between laps (no pit messages in this export)',
        });
      }
    }
  }

  // In/out laps, time lost around each stop, track status during the stop.
  for (const car of cars) {
    const cl = lapsByCar.get(car.id) ?? [];
    const mine = pitStops.filter((p) => p.carId === car.id);
    for (const p of mine) {
      const a = cl[p.lap - 1];
      if (a) a.pitIn = true;
      const b = p.outLap ? cl[p.outLap - 1] : undefined;
      if (b) b.pitOut = true;
    }
    const greenMedian = median(cl.filter(isGreenLap).map((l) => (l.lapTimeMs as number) / 1000));
    for (const p of mine) {
      const a = cl[p.lap - 1];
      const b = p.outLap ? cl[p.outLap - 1] : undefined;
      if (greenMedian !== null && a?.lapTimeMs && b?.lapTimeMs) {
        p.pitExcessS = r3(a.lapTimeMs / 1000 + b.lapTimeMs / 1000 - 2 * greenMedian);
      }
      p.underTrackStatus =
        a || b ? worseStatus(a?.trackStatus ?? null, b?.trackStatus ?? null) : null;
    }
  }

  // Race state at each lap line. Gaps only where both cumulative times are known (never backfilled).
  const totalLaps = Math.max(0, ...cars.map((c) => lapsByCar.get(c.id)?.length ?? 0));
  const lapTiming: LapTiming = { laps: [], leaderTimeS: [], cars: {} };
  for (const car of cars)
    lapTiming.cars[car.id] = {
      position: [],
      cumulativeTimeS: [],
      gapToLeaderMs: [],
      gapToAheadMs: [],
      pit: [],
    };
  const cum = (id: string, k: number): number | null =>
    k === 0 ? 0 : (lapsByCar.get(id)?.[k - 1]?.endTime ?? null);
  for (let k = 0; k <= totalLaps; k++) {
    lapTiming.laps.push(k);
    const known = cars.map((c) => cum(c.id, k)).filter((v): v is number => v !== null);
    const lead = k === 0 ? 0 : known.length ? Math.min(...known) : null;
    lapTiming.leaderTimeS.push(lead);
    for (const car of cars) {
      const tr = lapTiming.cars[car.id] as LapTiming['cars'][string];
      const p = positions.get(car.id) ?? [];
      const position =
        k === 0 ? (p[0] ?? car.gridPosition) : cum(car.id, k) === null ? null : (p[k] ?? null);
      tr.position.push(position);
      tr.cumulativeTimeS.push(cum(car.id, k));
      const mine = cum(car.id, k);
      tr.gapToLeaderMs.push(
        k === 0 || mine === null || lead === null ? null : Math.round((mine - lead) * 1000),
      );
      const lap = lapsByCar.get(car.id)?.[k - 1];
      tr.pit.push(lap?.pitIn ? 'in' : lap?.pitOut ? 'out' : null);
    }
    for (const car of cars) {
      const tr = lapTiming.cars[car.id] as LapTiming['cars'][string];
      const position = tr.position[k] ?? null;
      const ahead =
        position !== null && position > 1
          ? cars.find((o) => lapTiming.cars[o.id]?.position[k] === position - 1)
          : undefined;
      const mine = cum(car.id, k);
      const theirs = ahead ? cum(ahead.id, k) : null;
      const gap =
        k === 0 || mine === null || theirs === null ? null : Math.round((mine - theirs) * 1000);
      tr.gapToAheadMs.push(gap);
      const lap = lapsByCar.get(car.id)?.[k - 1];
      if (lap) {
        lap.gapToAheadMs = gap;
        lap.gapToLeaderMs = tr.gapToLeaderMs[k] ?? null;
      }
    }
  }

  // Events from race control (2026), or lap-level approximations (2025).
  const events: Session['events'] = [];
  for (const m of rc) {
    const type = EVENTS[m['message-type']];
    const time = rcTime(m);
    if (!type || time === null) continue;
    const inv: number[] = m['involved-drivers'] ?? [];
    const lap = num(m['lap-number']);
    switch (m['message-type']) {
      case 'OVERTAKE':
        events.push({
          sessionTime: time,
          lap,
          type,
          carId: idOf(m['overtaker-index']),
          otherCarId: idOf(m['overtaken-index']),
          detail: m['overtaker-pitting'] || m['overtaken-pitting'] ? 'pit-related' : null,
        });
        break;
      case 'PENALTY':
        events.push({
          sessionTime: time,
          lap,
          type,
          carId: idOf(m['vehicle-index']),
          otherCarId: m['other-vehicle-index'] === 255 ? null : idOf(m['other-vehicle-index']),
          detail: `${String(m['penalty-type'])}: ${String(m['infringement-type'])}${num(m.time) !== null && m.time !== 255 ? `, ${m.time} s` : ''}`,
        });
        break;
      case 'SAFETY_CAR':
        events.push({
          sessionTime: time,
          lap,
          type,
          carId: null,
          otherCarId: null,
          detail: `${String(m['sc-type'])} ${String(m['event-type'])}`,
        });
        break;
      case 'COLLISION':
        events.push({
          sessionTime: time,
          lap,
          type,
          carId: idOf(inv[0]),
          otherCarId: idOf(inv[1]),
          detail: str(m.severity),
        });
        break;
      case 'CAR_DAMAGE':
        events.push({
          sessionTime: time,
          lap,
          type,
          carId: idOf(inv[0]),
          otherCarId: null,
          detail: str(m['damaged-part']),
        });
        break;
      default:
        events.push({
          sessionTime: time,
          lap,
          type,
          carId: idOf(inv[0]),
          otherCarId: null,
          detail: null,
        });
    }
  }
  if (!rc.length) {
    const endOf = (id: string | null, lap: number): number | null =>
      id ? (lapsByCar.get(id)?.[lap - 1]?.endTime ?? null) : null;
    for (const o of d.overtakes?.records ?? []) {
      const a = idOf(null, o['overtaking-driver-name']);
      const b = idOf(null, o['overtaken-driver-name']);
      const lap = num(o['overtaking-driver-lap']);
      const time = lap === null ? null : endOf(a, lap);
      if (time !== null)
        events.push({
          sessionTime: time,
          lap,
          type: 'overtake',
          carId: a,
          otherCarId: b,
          detail: 'time = end of lap (approximate)',
        });
    }
    notes.push(
      '2025 format has no race-control messages: pit stops inferred from tyre sets, events placed at the end of their lap.',
    );
  }
  events.sort((x, y) => x.sessionTime - y.sessionTime);

  // Track-status periods: the worst status any car saw on each lap.
  const worstByLap = new Map<number, TrackStatus>();
  for (const l of laps)
    worstByLap.set(l.lapNumber, worseStatus(worstByLap.get(l.lapNumber) ?? null, l.trackStatus));
  const trackStatusPeriods = periodsFromLaps(
    [...worstByLap].map(([lapNumber, trackStatus]) => ({ lapNumber, trackStatus })),
  );

  const grids = cars.map((c) => c.gridPosition ?? 0);
  const fieldSize = Math.max(0, ...grids);
  if (fieldSize > cars.length)
    notes.push(
      `The source field had at least ${fieldSize} cars, but only ${cars.length} are in the export; gaps to the others are unknown.`,
    );
  const sessionType = /race/i.test(String(si['session-type'] ?? ''))
    ? 'race'
    : /qual/i.test(String(si['session-type'] ?? ''))
      ? 'qualifying'
      : 'unknown';
  const sector2 = num(si['sector-2-lap-distance-start']);
  const sector3 = num(si['sector-3-lap-distance-start']);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `linuz90:${uidText ?? fileName}`,
    source: {
      kind: 'linuz90-json',
      sourceSessionId: uidText ?? fileName,
      gameVersion: str(d['game-version']),
      distanceSource: 'none',
    },
    licence: LINUZ90_LICENCE,
    track: {
      name: str(si['track-id']),
      sourceTrackId: str(si['track-id']),
      lengthM: num(si['track-length']),
      sectorStartsM: sector2 !== null && sector3 !== null ? [0, sector2, sector3] : null,
    },
    sessionType,
    sessionTypeLabel: str(si['session-type']),
    totalLaps: num(si['total-laps']),
    durationS: r3(Math.max(0, ...laps.map((l) => l.endTime ?? 0))),
    playerCarId: cars.find((c) => c.isPlayer)?.id ?? null,
    cars,
    laps,
    stints,
    pitStops,
    events,
    timing: null,
    lapTiming,
    trackStatusPeriods,
    weather: str(si.weather),
    quality: { notes },
  };
};
