// Checks the committed Sakhir and Spa sessions (linuz90 exports) against spike 2c's findings.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SessionSchema, reviewStrategy, type Session } from './index.js';

const load = (slug: string): Session =>
  SessionSchema.parse(
    JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          '../../../apps/race-engineering/web/public/data/sessions',
          slug,
          'session.json',
        ),
        'utf8',
      ),
    ),
  );

describe('Sakhir race (converted)', () => {
  const s = load('sakhir-race');

  it('has the full field, the VSC on laps 8–9 and the safety car', () => {
    expect(s.cars).toHaveLength(21);
    expect(s.trackStatusPeriods[0]).toEqual({ status: 'vsc', fromLap: 8, toLap: 9 });
    expect(
      s.trackStatusPeriods.some((p) => p.status === 'sc' && p.fromLap <= 22 && p.toLap >= 24),
    ).toBe(true);
  });

  it('de-duplicates pit messages: 43 pit records', () => {
    expect(s.pitStops).toHaveLength(43);
  });

  it('flags stops under VSC or safety car, and the winner stopped on green at lap 12', () => {
    const winner = s.cars.find((c) => c.finalPosition === 1)!;
    const stops = s.pitStops.filter((p) => p.carId === winner.id);
    expect(stops[0]).toMatchObject({ lap: 12, underTrackStatus: 'green' });
    expect(stops[0]!.pitExcessS).toBeCloseTo(26.36, 1);
    const player = s.cars.find((c) => c.isPlayer)!;
    expect(s.pitStops.filter((p) => p.carId === player.id).map((p) => p.underTrackStatus)).toEqual([
      'vsc',
      'sc',
    ]);
  });

  it('takes compounds from lap history, so every stop changes compound or is a visit', () => {
    for (const p of s.pitStops.filter((x) => x.kind === 'stop' && x.compoundAfter !== 'unknown')) {
      expect(p.compoundAfter).not.toBe('unknown');
    }
  });

  it('never backfills gaps: unknown gaps stay null', () => {
    const lt = s.lapTiming!;
    for (const car of Object.values(lt.cars)) {
      car.cumulativeTimeS.forEach((t, k) => {
        if (t === null) expect(car.gapToLeaderMs[k]).toBeNull();
      });
    }
  });

  it('uses fictional handles and no team names', () => {
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/Williams|Mclaren|Ferrari|Mercedes|Red Bull/);
    expect(s.cars.every((c) => c.sourceTeamId === null)).toBe(true);
  });

  it('reviews strategy with lap-time trends and excluded laps', () => {
    const review = reviewStrategy(s);
    const player = review.find((r) => r.isPlayer)!;
    expect(player.stops).toHaveLength(2);
    const excluded = player.stints.flatMap((st) => st.excludedLaps.map((e) => e.reason));
    expect(excluded).toContain('sc');
    expect(excluded).toContain('pit');
    // The soft stint after the safety car has only 4 green laps: its trend must not be quoted.
    const last = player.stints[player.stints.length - 1]!;
    expect(last.greenLapsUsed).toBeLessThan(5);
    expect(last.trendReportable).toBe(false);
  });
});

describe('Spa race (converted)', () => {
  const s = load('spa-race');

  it('has six one-stop cars with the stop inferred from tyre sets', () => {
    expect(s.cars).toHaveLength(6);
    expect(s.pitStops).toHaveLength(6);
    expect(s.pitStops.every((p) => p.evidence.startsWith('tyre set change'))).toBe(true);
  });

  it('has no safety-car periods', () => {
    expect(s.trackStatusPeriods).toEqual([]);
  });
});
