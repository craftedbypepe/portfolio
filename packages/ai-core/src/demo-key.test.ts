import { describe, expect, it } from 'vitest';
import { demoKey, stableStringify } from './demo-key.js';

describe('stableStringify', () => {
  it('ignores key order and undefined values', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }], z: undefined })).toBe(
      '{"a":[2,{"c":2,"d":1}],"b":1}',
    );
  });
});

describe('demoKey', () => {
  it('is stable for equal inputs and changes with the model', async () => {
    const base = { model: 'm1', promptVersion: 'v1', payload: { lapA: 2, lapB: 3 } };
    const k1 = await demoKey(base);
    expect(k1).toMatch(/^[0-9a-f]{16}$/);
    expect(await demoKey({ ...base, payload: { lapB: 3, lapA: 2 } })).toBe(k1);
    expect(await demoKey({ ...base, model: 'm2' })).not.toBe(k1);
  });
});
