// Checks the committed Mexico session against the game's official timing (spikes 2–4).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LapTraceSchema, SessionSchema, handleFor } from './index.js';

const dir = join(
  import.meta.dirname,
  '../../../apps/race-engineering/web/public/data/sessions/mexico-city-race',
);
const session = SessionSchema.parse(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')));
const lap = (carId: string, n: number) =>
  session.laps.find((l) => l.carId === carId && l.lapNumber === n);

describe('Mexico race (converted)', () => {
  it('has the player lap times from the game', () => {
    expect(session.playerCarId).toBe('car-1');
    expect(lap('car-1', 2)?.lapTimeMs).toBe(79_328);
    expect(lap('car-1', 3)?.lapTimeMs).toBe(79_997);
    expect((lap('car-1', 3)!.lapTimeMs! - lap('car-1', 2)!.lapTimeMs!) / 1000).toBeCloseTo(
      0.669,
      3,
    );
  });

  it('re-estimates line crossings within 50 ms of the official lap times', () => {
    for (const l of session.laps.filter((x) => x.lapNumber > 1 && x.lapTimeMs !== null)) {
      expect(Math.abs(l.derivedLapTimeMs! - l.lapTimeMs!)).toBeLessThan(50);
    }
  });

  it('pins every trace to the official lap time on a grid from 0 m', () => {
    for (const l of session.laps.filter((x) => x.traceFile)) {
      const tr = LapTraceSchema.parse(JSON.parse(readFileSync(join(dir, l.traceFile!), 'utf8')));
      expect(tr.tau[0]).toBe(0);
      expect(tr.tau[tr.tau.length - 1]).toBeCloseTo(l.lapTimeMs! / 1000, 3);
      expect(tr.tau.length).toBe(Math.ceil(tr.lengthM / tr.stepM) + 1);
    }
  });

  it('uses fictional handles only', () => {
    session.cars.forEach((c) => {
      expect(c.handle).toBe(handleFor(Number(c.id.slice(4))));
    });
    expect(JSON.stringify(session)).not.toMatch(/"Player"|driverName|gamertag/i);
  });

  it('keeps unknown values as null and session IDs as strings', () => {
    expect(typeof session.source.sourceSessionId).toBe('string');
    expect(session.licence.credit).toContain('SpeedHQ/RaceIQ');
  });
});
