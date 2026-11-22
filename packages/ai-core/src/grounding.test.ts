import { describe, expect, it } from 'vitest';
import { extractNumbers, findUngroundedNumbers } from './index.js';

describe('extractNumbers', () => {
  it('reads integers, decimals and negatives', () => {
    expect(extractNumbers('0.267 s lost, 124 vs 126 km/h, delta -0.5')).toEqual([
      0.267, 124, 126, -0.5,
    ]);
  });

  it('returns an empty list when there are no numbers', () => {
    expect(extractNumbers('carry more speed')).toEqual([]);
  });
});

describe('findUngroundedNumbers', () => {
  it('passes text whose numbers all come from the tools', () => {
    expect(findUngroundedNumbers('0.267 s lost at T12', [0.267, 12])).toEqual([]);
  });

  it('flags an invented number', () => {
    expect(findUngroundedNumbers('0.3 s lost at T12', [0.267, 12])).toEqual([0.3]);
  });
});
