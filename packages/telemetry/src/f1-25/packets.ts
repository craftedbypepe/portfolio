// F1 25 UDP packet parsers, written from EA's public UDP specification (v3).
// Little-endian packed structs, 29-byte header, 22-car arrays. Only the fields the product needs.

import type { Bytes } from './bytes.js';

export const PACKET_SIZES: Record<number, number> = {
  0: 1349,
  1: 753,
  2: 1285,
  3: 45,
  4: 1284,
  5: 1133,
  6: 1352,
  7: 1239,
  8: 1042,
  9: 954,
  10: 1041,
  11: 1460,
  12: 231,
  13: 273,
  14: 101,
  15: 1131,
};
export const PACKET_NAMES: Record<number, string> = {
  0: 'Motion',
  1: 'Session',
  2: 'LapData',
  3: 'Event',
  4: 'Participants',
  5: 'CarSetups',
  6: 'CarTelemetry',
  7: 'CarStatus',
  8: 'FinalClassification',
  9: 'LobbyInfo',
  10: 'CarDamage',
  11: 'SessionHistory',
  12: 'TyreSets',
  13: 'MotionEx',
  14: 'TimeTrial',
  15: 'LapPositions',
};
export const MAX_CARS = 22;
const HDR = 29;

export interface Header {
  packetId: number;
  /** 64-bit session UID as a hex string: JavaScript numbers lose precision above 2^53. */
  sessionUid: string;
  sessionTime: number;
  frameId: number;
  playerCarIndex: number;
  gameVersion: string;
}

export const isF125Packet = (b: Bytes): boolean =>
  b.length >= HDR && b.u16(0) === 2025 && b.u8(2) === 25 && PACKET_SIZES[b.u8(6)] === b.length;

export const parseHeader = (b: Bytes): Header => ({
  packetId: b.u8(6),
  sessionUid: b.u64(7).toString(16),
  sessionTime: b.f32(15),
  frameId: b.u32(19),
  playerCarIndex: b.u8(27),
  gameVersion: `${b.u8(3)}.${String(b.u8(4)).padStart(2, '0')}`,
});

const perCar = <T>(stride: number, start: number, read: (o: number) => T): T[] =>
  Array.from({ length: MAX_CARS }, (_, i) => read(start + i * stride));

// 0 · Motion (60 bytes per car). The track plane is x/z; y is height.
export interface CarMotion {
  x: number;
  z: number;
}
export const parseMotion = (b: Bytes): CarMotion[] =>
  perCar(60, HDR, (o) => ({ x: b.f32(o), z: b.f32(o + 8) }));

// 1 · Session
export interface SessionInfo {
  totalLaps: number;
  trackLengthM: number;
  sessionType: number;
  trackId: number;
  safetyCarStatus: number;
  networkGame: boolean;
  sector2StartM: number;
  sector3StartM: number;
}
export const parseSession = (b: Bytes): SessionInfo => ({
  totalLaps: b.u8(HDR + 3),
  trackLengthM: b.u16(HDR + 4),
  sessionType: b.u8(HDR + 6),
  trackId: b.i8(HDR + 7),
  safetyCarStatus: b.u8(HDR + 124),
  networkGame: b.u8(HDR + 125) === 1,
  sector2StartM: b.f32(HDR + 716),
  sector3StartM: b.f32(HDR + 720),
});

// 2 · Lap Data (57 bytes per car)
export interface LapDataCar {
  lastLapTimeMs: number;
  sector1Ms: number;
  sector2Ms: number;
  deltaToLeaderMs: number;
  lapDistance: number;
  position: number;
  currentLapNum: number;
  pitStatus: number;
  sector: number;
  lapInvalid: number;
  gridPosition: number;
  driverStatus: number;
  resultStatus: number;
  pitLaneTimeMs: number;
  pitStopTimerMs: number;
}
export const parseLapData = (b: Bytes): LapDataCar[] =>
  perCar(57, HDR, (o) => ({
    lastLapTimeMs: b.u32(o),
    sector1Ms: b.u16(o + 8) + b.u8(o + 10) * 60_000,
    sector2Ms: b.u16(o + 11) + b.u8(o + 13) * 60_000,
    deltaToLeaderMs: b.u16(o + 17) + b.u8(o + 19) * 60_000,
    lapDistance: b.f32(o + 20),
    position: b.u8(o + 32),
    currentLapNum: b.u8(o + 33),
    pitStatus: b.u8(o + 34),
    sector: b.u8(o + 36),
    lapInvalid: b.u8(o + 37),
    gridPosition: b.u8(o + 43),
    driverStatus: b.u8(o + 44),
    resultStatus: b.u8(o + 45),
    pitLaneTimeMs: b.u16(o + 47),
    pitStopTimerMs: b.u16(o + 49),
  }));

// 3 · Event
export interface EventPacket {
  code: string;
  vehicleIdx: number | null;
  otherVehicleIdx: number | null;
}
export const parseEvent = (b: Bytes): EventPacket => {
  const code = b.ascii(HDR, HDR + 4);
  const o = HDR + 4;
  switch (code) {
    case 'FTLP':
    case 'RTMT':
    case 'TMPT':
    case 'RCWN':
    case 'DTSV':
    case 'SGSV':
    case 'SPTP':
      return { code, vehicleIdx: b.u8(o), otherVehicleIdx: null };
    case 'PENA':
      return { code, vehicleIdx: b.u8(o + 2), otherVehicleIdx: b.u8(o + 3) };
    case 'OVTK':
    case 'COLL':
      return { code, vehicleIdx: b.u8(o), otherVehicleIdx: b.u8(o + 1) };
    default:
      return { code, vehicleIdx: null, otherVehicleIdx: null };
  }
};

// 4 · Participants (57 bytes per car)
export interface Participant {
  aiControlled: boolean;
  teamId: number;
  raceNumber: number;
  name: string;
  /** The player's UDP setting: false means their telemetry is restricted (zeros, not measurements). */
  telemetryPublic: boolean;
}
export const parseParticipants = (b: Bytes): { numActiveCars: number; cars: Participant[] } => ({
  numActiveCars: b.u8(HDR),
  cars: perCar(57, HDR + 1, (o) => ({
    aiControlled: b.u8(o) === 1,
    teamId: b.u8(o + 3),
    raceNumber: b.u8(o + 5),
    name: b.utf8z(o + 7, 32),
    telemetryPublic: b.u8(o + 39) === 1,
  })),
});

// 6 · Car Telemetry (60 bytes per car)
export interface CarTelemetry {
  speedKmh: number;
  throttle: number;
  brake: number;
  gear: number;
}
export const parseCarTelemetry = (b: Bytes): CarTelemetry[] =>
  perCar(60, HDR, (o) => ({
    speedKmh: b.u16(o),
    throttle: b.f32(o + 2),
    brake: b.f32(o + 10),
    gear: b.i8(o + 15),
  }));

// 7 · Car Status (55 bytes per car)
export interface CarStatus {
  actualCompound: number;
  visualCompound: number;
  tyresAgeLaps: number;
}
export const parseCarStatus = (b: Bytes): CarStatus[] =>
  perCar(55, HDR, (o) => ({
    actualCompound: b.u8(o + 25),
    visualCompound: b.u8(o + 26),
    tyresAgeLaps: b.u8(o + 27),
  }));

// 8 · Final Classification (46 bytes per car)
export interface FinalClassificationCar {
  position: number;
  gridPosition: number;
  resultStatus: number;
}
export const parseFinalClassification = (b: Bytes): FinalClassificationCar[] =>
  perCar(46, HDR + 1, (o) => ({
    position: b.u8(o),
    gridPosition: b.u8(o + 2),
    resultStatus: b.u8(o + 5),
  }));

// 11 · Session History (one car per packet)
export interface HistoryLap {
  lapTimeMs: number;
  s1Ms: number;
  s2Ms: number;
  s3Ms: number;
  validFlags: number;
}
export interface SessionHistory {
  carIdx: number;
  laps: HistoryLap[];
}
export const parseSessionHistory = (b: Bytes): SessionHistory => {
  const numLaps = Math.min(b.u8(HDR + 1), 100);
  const laps: HistoryLap[] = [];
  for (let i = 0; i < numLaps; i++) {
    const o = HDR + 7 + i * 14;
    laps.push({
      lapTimeMs: b.u32(o),
      s1Ms: b.u16(o + 4) + b.u8(o + 6) * 60_000,
      s2Ms: b.u16(o + 7) + b.u8(o + 9) * 60_000,
      s3Ms: b.u16(o + 10) + b.u8(o + 12) * 60_000,
      validFlags: b.u8(o + 13),
    });
  }
  return { carIdx: b.u8(HDR), laps };
};

// Lookup tables (spec appendix). Track names are circuit locations, not trademarks.
export const TRACKS: Record<number, string> = {
  0: 'Melbourne',
  2: 'Shanghai',
  3: 'Sakhir',
  4: 'Catalunya',
  5: 'Monaco',
  6: 'Montreal',
  7: 'Silverstone',
  9: 'Hungaroring',
  10: 'Spa',
  11: 'Monza',
  12: 'Singapore',
  13: 'Suzuka',
  14: 'Abu Dhabi',
  15: 'Austin',
  16: 'Interlagos',
  17: 'Spielberg',
  19: 'Mexico City',
  20: 'Baku',
  26: 'Zandvoort',
  27: 'Imola',
  29: 'Jeddah',
  30: 'Miami',
  31: 'Las Vegas',
  32: 'Losail',
};
export const SESSION_TYPES: Record<number, string> = {
  1: 'Practice 1',
  2: 'Practice 2',
  3: 'Practice 3',
  4: 'Short Practice',
  5: 'Qualifying 1',
  6: 'Qualifying 2',
  7: 'Qualifying 3',
  8: 'Short Qualifying',
  9: 'One-Shot Qualifying',
  10: 'Sprint Shootout 1',
  11: 'Sprint Shootout 2',
  12: 'Sprint Shootout 3',
  13: 'Short Sprint Shootout',
  14: 'One-Shot Sprint Shootout',
  15: 'Race',
  16: 'Race 2',
  17: 'Race 3',
  18: 'Time Trial',
};
export const VISUAL_COMPOUND: Record<number, 'soft' | 'medium' | 'hard' | 'inter' | 'wet'> = {
  16: 'soft',
  17: 'medium',
  18: 'hard',
  7: 'inter',
  8: 'wet',
};
export const ACTUAL_COMPOUND: Record<number, string> = {
  16: 'C5',
  17: 'C4',
  18: 'C3',
  19: 'C2',
  20: 'C1',
  21: 'C0',
  22: 'C6',
  7: 'inter',
  8: 'wet',
};
