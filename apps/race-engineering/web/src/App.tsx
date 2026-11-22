import { formatLapTime, type Session } from '@portfolio/telemetry';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@portfolio/ui';
import { useEffect, useState } from 'react';
import {
  HERO,
  loadMode,
  loadSavedDebrief,
  loadSession,
  type ApiMode,
  type SavedDebrief,
} from './data';

// Live skeleton (SIE-69): real data and the saved hero debrief, wired end to end. Phase 5 designs replace this screen.
export const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [debrief, setDebrief] = useState<SavedDebrief | null>(null);
  const [mode, setMode] = useState<ApiMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMode().then(setMode);
    loadSession(HERO.slug)
      .then(async (s) => {
        setSession(s);
        setDebrief(await loadSavedDebrief(s.id, HERO.a, HERO.b));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Race Engineering Agent</h1>
        <Badge variant={mode?.mode === 'live' ? 'default' : 'secondary'}>
          {mode === null
            ? 'Checking…'
            : mode.mode === 'live'
              ? 'Live AI available'
              : 'Demo mode · no keys needed'}
        </Badge>
      </header>

      {error && <p role="alert">Couldn't load the session data: {error}</p>}
      {!session && !error && <Skeleton className="h-48 w-full" />}
      {session && <SessionCard session={session} />}
      {debrief && <DebriefCard debrief={debrief} />}

      <footer className="text-muted-foreground text-xs">
        {session?.licence.credit}. Player names replaced with fictional handles. Unofficial project,
        not affiliated with Formula 1, the FIA, EA Sports or Codemasters.
      </footer>
    </main>
  );
};

const SessionCard = ({ session }: { session: Session }) => {
  const best = Math.min(
    ...session.laps.filter((l) => l.lapNumber > 1 && l.lapTimeMs).map((l) => l.lapTimeMs as number),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {session.track.name} · {session.sessionTypeLabel}
        </CardTitle>
        <CardDescription>
          {session.cars.length} cars · {session.totalLaps} laps · recorded F1 25 session
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              {[1, 2, 3, 4, 5].map((n) => (
                <TableHead key={n} className="text-right">
                  Lap {n}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {session.cars.map((car) => (
              <TableRow key={car.id}>
                <TableCell className="font-medium">
                  {car.handle}
                  {car.isPlayer && ' (you)'}
                </TableCell>
                {[1, 2, 3, 4, 5].map((n) => {
                  const lap = session.laps.find((l) => l.carId === car.id && l.lapNumber === n);
                  const t = lap?.lapTimeMs ?? null;
                  return (
                    <TableCell
                      key={n}
                      className={`text-right tabular-nums ${t === best ? 'font-semibold' : ''}`}
                    >
                      {t === null ? '—' : formatLapTime(t)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

const DebriefCard = ({ debrief }: { debrief: SavedDebrief }) => (
  <Card>
    <CardHeader>
      <CardTitle>Your lap 2 vs lap 3 · where the time went</CardTitle>
      <CardDescription>
        Saved answer · {debrief.model}
        {debrief.placeholder && ' · placeholder'}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ol className="flex flex-col gap-3">
        {debrief.points.map((p) => (
          <li key={p.area}>
            <p className="font-medium">
              {p.area}: {p.timeLostS.toFixed(3)} s lost. {p.finding}
            </p>
            <p className="text-muted-foreground">{p.action}</p>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground mt-4 text-xs">{debrief.note}</p>
    </CardContent>
  </Card>
);
