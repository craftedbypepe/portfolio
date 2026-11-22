// Reader for session recordings that store F1 25 UDP datagrams in a simple framed stream.
// Our own implementation (ported from spike 2); no third-party code.
//
// Layout (little-endian):
//   stream  := record*            (an optional 4-byte file header comes first; never assumed)
//   record  := meta | frame
//   meta    := u32 0xFFFFFFFF, u32 payloadLen, payload       (markers and bootstraps; reset delta state)
//   frame   := u32 len (bit 31 = has timestamp), [u64 receiveTimeMs], payload
//   payload := raw UDP datagram | "RQSD" sparse delta against the previous full datagram
//   RQSD v1 := "RQSD", u8 version, u32 backDistance, u32 fullLength, bitmap, changed 32-byte blocks

import { Bytes } from './bytes.js';

const META = 0xffffffff;
const TS_FLAG = 0x80000000;
const BLOCK = 32;
const MAX_FRAME = 16 * 1024 * 1024;
const MARKERS: Record<number, string> = {
  0x4d474553: 'segment-boundary',
  0x58544753: 'segment-context',
  0x454e4353: 'segment-context-end',
  0x31505352: 'sparse-format',
};

export interface ContainerStats {
  bytes: number;
  frames: number;
  fullFrames: number;
  deltaFrames: number;
  deltaErrors: number;
  markers: Record<string, number>;
  hasFileHeader: boolean;
  truncatedTailBytes: number;
}

export interface Frame {
  data: Uint8Array;
  receiveTimeMs: number | null;
}

export const newContainerStats = (): ContainerStats => ({
  bytes: 0,
  frames: 0,
  fullFrames: 0,
  deltaFrames: 0,
  deltaErrors: 0,
  markers: {},
  hasFileHeader: false,
  truncatedTailBytes: 0,
});

const isDelta = (p: Uint8Array): boolean =>
  p.length >= 13 && p[0] === 0x52 && p[1] === 0x51 && p[2] === 0x53 && p[3] === 0x44;

/** Same packet identity: header bytes 0..14 and length. */
const sameIdentity = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  const n = Math.min(15, a.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
};

export const applyDelta = (payload: Uint8Array, prev: Uint8Array): Uint8Array => {
  const p = new Bytes(payload);
  if (p.u8(4) !== 1) throw new Error(`Unsupported delta version ${p.u8(4)}`);
  const len = p.u32(9);
  if (len !== prev.length) throw new Error(`Delta length ${len} != previous ${prev.length}`);
  const blocks = Math.ceil(len / BLOCK);
  const bitmapLen = Math.ceil(blocks / 8);
  const out = prev.slice();
  let at = 13 + bitmapLen;
  for (let b = 0; b < blocks; b++) {
    if (((payload[13 + (b >> 3)] ?? 0) & (1 << (b & 7))) === 0) continue;
    const start = b * BLOCK;
    const n = Math.min(BLOCK, len - start);
    out.set(payload.subarray(at, at + n), start);
    at += n;
  }
  if (at !== payload.length) throw new Error('Delta payload size mismatch');
  return out;
};

export function* readFrames(
  data: Uint8Array,
  stats: ContainerStats = newContainerStats(),
): Generator<Frame> {
  const buf = new Bytes(data);
  stats.bytes = data.length;
  let off = 0;
  let prev: Uint8Array | null = null;
  let fullAt = -1;
  while (off + 4 <= data.length) {
    const recAt = off;
    const word = buf.u32(off);
    if (word === META) {
      if (off + 8 > data.length) break;
      const n = buf.u32(off + 4);
      if (off + 8 + n > data.length) break;
      if (n === 4 && recAt === 0) {
        stats.hasFileHeader = true;
      } else if (n === 8) {
        const name = MARKERS[buf.u32(off + 8)] ?? 'unknown-marker';
        stats.markers[name] = (stats.markers[name] ?? 0) + 1;
        if (name !== 'sparse-format' && name !== 'segment-context') {
          prev = null;
          fullAt = -1;
        }
      } else {
        stats.markers['bootstrap'] = (stats.markers['bootstrap'] ?? 0) + 1;
        prev = null;
        fullAt = -1;
      }
      off += 8 + n;
      continue;
    }
    const hasTs = (word & TS_FLAG) !== 0;
    const len = (word & ~TS_FLAG) >>> 0;
    const head = hasTs ? 12 : 4;
    if (len === 0 || len > MAX_FRAME || off + head + len > data.length) {
      stats.truncatedTailBytes = data.length - off;
      break;
    }
    const receiveTimeMs = hasTs ? Number(buf.u64(off + 4)) : null;
    const payload = data.subarray(off + head, off + head + len);
    off += head + len;

    let frame: Uint8Array;
    if (isDelta(payload)) {
      const back = new Bytes(payload).u32(5);
      if (!prev || recAt - back !== fullAt) {
        stats.deltaErrors++;
        continue;
      }
      try {
        frame = applyDelta(payload, prev);
      } catch {
        stats.deltaErrors++;
        continue;
      }
      if (!sameIdentity(frame, prev)) {
        stats.deltaErrors++;
        continue;
      }
      stats.deltaFrames++;
    } else {
      frame = payload;
      fullAt = recAt;
      stats.fullFrames++;
    }
    stats.frames++;
    prev = frame;
    yield { data: frame, receiveTimeMs };
  }
}
