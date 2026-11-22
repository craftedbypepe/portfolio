// Converts a linuz90/f1-telemetry-viewer race export into the app's session file.
// Usage: bun scripts/convert-linuz90.ts <export.json> <outDir>
// Raw exports stay outside the repo; only the converted, pseudonymised output is written.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SessionSchema, convertLinuz90 } from '../src/index.js';

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error('Usage: bun scripts/convert-linuz90.ts <export.json> <outDir>');
  process.exit(1);
}

const session = SessionSchema.parse(
  convertLinuz90({ text: readFileSync(input, 'utf8'), fileName: basename(input) }),
);
const slug = `${session.track.name ?? 'unknown'}-${session.sessionType}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-');
const dir = join(outDir, slug);
mkdirSync(dir, { recursive: true });
const json = JSON.stringify(session);
writeFileSync(join(dir, 'session.json'), json);
console.log(
  `${dir}: ${session.cars.length} cars, ${session.laps.length} laps, ${session.pitStops.length} pit records, ` +
    `${session.events.length} events, periods ${JSON.stringify(session.trackStatusPeriods)} (${Math.round(json.length / 1024)} KB)`,
);
for (const note of session.quality.notes) console.log(`  · ${note}`);
