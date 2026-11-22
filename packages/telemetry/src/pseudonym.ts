// Fictional call-signs for every car. Real player names (gamertags) never leave the converter.
// Short, one word each, so radio calls stay within the 12-word limit (spike 4).

const HANDLES = [
  'Apex',
  'Blaze',
  'Comet',
  'Drift',
  'Echo',
  'Flint',
  'Gale',
  'Halo',
  'Ion',
  'Jett',
  'Kite',
  'Lynx',
  'Mako',
  'Nova',
  'Onyx',
  'Pike',
  'Quill',
  'Rook',
  'Sable',
  'Talon',
  'Umbra',
  'Vex',
] as const;

/** Deterministic handle for a car index (0–21). */
export const handleFor = (carIndex: number): string => HANDLES[carIndex] ?? `Car ${carIndex + 1}`;
