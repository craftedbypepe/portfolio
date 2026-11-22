import { describe, expect, it } from 'vitest';
import { newContainerStats, readFrames } from './container.js';

const u32 = (v: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const frame = (payload: Uint8Array) => concat(u32(payload.length), payload);
const datagram = (fill: number, len = 64) => new Uint8Array(len).fill(fill);

describe('readFrames', () => {
  it('reads frames when the recording has no file header', () => {
    const stats = newContainerStats();
    const frames = [...readFrames(concat(frame(datagram(1)), frame(datagram(2))), stats)];
    expect(frames).toHaveLength(2);
    expect(frames[1]?.data[0]).toBe(2);
    expect(stats.hasFileHeader).toBe(false);
  });

  it('skips an optional file header', () => {
    const stats = newContainerStats();
    const header = concat(u32(0xffffffff), u32(4), u32(0));
    const frames = [...readFrames(concat(header, frame(datagram(7))), stats)];
    expect(frames).toHaveLength(1);
    expect(stats.hasFileHeader).toBe(true);
  });

  it('reads the receive timestamp when the frame has one', () => {
    const ts = new Uint8Array(8);
    new DataView(ts.buffer).setBigUint64(0, 1234n, true);
    const payload = datagram(3);
    const rec = concat(u32((payload.length | 0x80000000) >>> 0), ts, payload);
    const [f] = [...readFrames(rec)];
    expect(f?.receiveTimeMs).toBe(1234);
  });

  it('applies a sparse delta on top of the previous full frame', () => {
    const full = datagram(0, 64);
    const fullRecord = frame(full);
    // Delta: change block 1 (bytes 32..63) to 9s.
    const head = new Uint8Array(13);
    head.set([0x52, 0x51, 0x53, 0x44, 1]);
    const v = new DataView(head.buffer);
    v.setUint32(5, fullRecord.length, true); // back distance to the full record
    v.setUint32(9, 64, true);
    const delta = concat(head, new Uint8Array([0b10]), new Uint8Array(32).fill(9));
    const stats = newContainerStats();
    const frames = [...readFrames(concat(fullRecord, frame(delta)), stats)];
    expect(stats.deltaFrames).toBe(1);
    expect(stats.deltaErrors).toBe(0);
    expect(frames[1]?.data[0]).toBe(0);
    expect(frames[1]?.data[40]).toBe(9);
  });

  it('stops cleanly at a truncated tail', () => {
    const stats = newContainerStats();
    const rec = concat(frame(datagram(1)), u32(500), datagram(1, 10));
    expect([...readFrames(rec, stats)]).toHaveLength(1);
    expect(stats.truncatedTailBytes).toBeGreaterThan(0);
  });
});
