import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@portfolio/ui';
import { formatLapTime } from '@portfolio/telemetry';

// Placeholder screen until the session loader (SIE-69) and phase 5 designs land.
export const App = () => (
  <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
    <header className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">Race Engineering Agent</h1>
      <Badge variant="secondary">Demo mode · no keys needed</Badge>
    </header>
    <Card>
      <CardHeader>
        <CardTitle>Mexico · lap 2 vs lap 3</CardTitle>
        <CardDescription>Sample lap: {formatLapTime(78_123)}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled>Compare laps (coming soon)</Button>
      </CardContent>
    </Card>
  </main>
);
