import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names and skips falsy values', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });

  it('lets later Tailwind classes win', () => {
    expect(cn('p-2 text-sm', 'p-4')).toBe('text-sm p-4');
  });
});
