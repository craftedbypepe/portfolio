// First piece of the runtime checker (SIE-28): every number the AI writes must come from tool output.
// Evidence-path checks and gate rules are added next.

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;

/** Returns every number in a piece of text, e.g. "0.267 s lost, 124 vs 126 km/h" → [0.267, 124, 126]. */
export const extractNumbers = (text: string): number[] =>
  (text.match(NUMBER_PATTERN) ?? []).map(Number);

/**
 * Returns the numbers in `text` that don't match any allowed value within `tolerance`.
 * An empty result means the text is grounded.
 */
export const findUngroundedNumbers = (
  text: string,
  allowed: readonly number[],
  tolerance = 1e-9,
): number[] =>
  extractNumbers(text).filter(
    (value) => !allowed.some((candidate) => Math.abs(candidate - value) <= tolerance),
  );
