// Converts a RaceIQ recording of F1 25 UDP packets into the app's session files.
// Usage: bun scripts/convert-raceiq.ts <recording.bin[.gz]> <outDir> [--only race|qualifying|...]
// Raw recordings stay outside the repo; only the converted, pseudonymised output is written.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { convertF125Recording, SessionSchema, LapTraceSchema } from '../src/index.js';

const [input, outDir, flag, only] = process.argv.slice(2);
if (!input || !outDir) {
  console.error(
    'Usage: bun scripts/convert-raceiq.ts <recording.bin[.gz]> <outDir> [--only <sessionType>]',
  );
  process.exit(1);
}

const raw = readFileSync(input);
const bytes =
  raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw, { maxOutputLength: 2 ** 31 - 1 }) : raw;
const started = Date.now();
const { sessions, container } = convertF125Recording(
  new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
);
console.log(
  `Read ${container.frames} frames (${container.deltaFrames} deltas, ${container.deltaErrors} errors) in ${Date.now() - started} ms`,
);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

for (const { session, traces } of sessions) {
  if (flag === '--only' && only && session.sessionType !== only) continue;
  if (session.laps.length === 0) continue;
  const dir = join(outDir, slug(`${session.track.name ?? 'unknown'}-${session.sessionType}`));
  mkdirSync(join(dir, 'laps'), { recursive: true });
  SessionSchema.parse(session);
  writeFileSync(join(dir, 'session.json'), JSON.stringify(session));
  let bytesOut = 0;
  for (const trace of traces) {
    LapTraceSchema.parse(trace);
    const json = JSON.stringify(trace);
    bytesOut += json.length;
    writeFileSync(join(dir, 'laps', `${trace.carId}-lap-${trace.lapNumber}.json`), json);
  }
  console.log(
    `${dir}: ${session.cars.length} cars, ${session.laps.length} laps, ${traces.length} traces (${Math.round(bytesOut / 1024)} KB)`,
  );
  for (const note of session.quality.notes) console.log(`  · ${note}`);
}
