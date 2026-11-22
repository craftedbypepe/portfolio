import { formatLapTime } from '@portfolio/telemetry';

// Placeholder screen until the design system (SIE-68) and the session loader (SIE-69) land.
export const App = () => (
  <main>
    <h1>Race Engineering Agent</h1>
    <p>Demo mode · no keys needed</p>
    <p>Sample lap: {formatLapTime(78_123)}</p>
  </main>
);
