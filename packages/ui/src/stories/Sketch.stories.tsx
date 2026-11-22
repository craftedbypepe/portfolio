import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpRight } from 'lucide-react';
import {
  Annotation,
  Badge,
  Button,
  Eyebrow,
  LineChartFrame,
  Panel,
  Placeholder,
  Stat,
} from '../index';

// Sketch theme (SIE-71): primitives and a sample screen. Switch sketch / blueprint / dark in the toolbar.
const meta = {
  title: 'Sketch/Primitives',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Panels: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-8 sm:grid-cols-2">
      <Panel label="Bordered panel">A boxed cell with a hairline border.</Panel>
      <Panel label="Cropped panel" cropped>
        Corner crop marks instead of a full border.
      </Panel>
      <Panel label="Dotted grid" grid className="sm:col-span-2">
        For charts and diagrams.
      </Panel>
    </div>
  ),
};

export const Stats: Story = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-2 gap-8 sm:grid-cols-4">
      <Stat label="Lap 2" value="1:19.328" />
      <Stat label="Lap 3" value="1:19.997" />
      <Stat label="Delta" value="+0.669" tone="loss" />
      <Stat label="Best sector" value="−0.120" tone="gain" />
    </div>
  ),
};

export const Annotations: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-5">
      <Annotation index={1} title="T12 area · 0.267 s lost" leader>
        Minimum speed 2 km/h lower (124 vs 126 km/h).
      </Annotation>
      <Annotation index={2} title="T8–T11 · 0.265 s lost" leader>
        Exit speed 6 km/h lower. Linked section, treat as one.
      </Annotation>
      <Annotation index={3} title="T2 area · 0.201 s lost" leader>
        Minimum speed 83 vs 95 km/h.
      </Annotation>
    </div>
  ),
};

export const SemanticColours: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-info-subtle text-info border-info">Info</Badge>
        <Badge className="bg-success-subtle text-success border-success">Success</Badge>
        <Badge className="bg-warning-subtle text-foreground border-warning">Warning</Badge>
        <Badge className="bg-danger-subtle text-danger border-danger">Danger</Badge>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div
          className="text-gain bg-hatch h-16 border"
          aria-label="Time gained (hatched)"
          role="img"
        />
        <div
          className="text-loss bg-hatch-cross h-16 border"
          aria-label="Time lost (cross-hatched)"
          role="img"
        />
      </div>
      <p className="text-muted-foreground text-sm">
        Gain and loss use colour plus a pattern, so the lap delta still reads in black and white.
      </p>
    </div>
  ),
};

export const Placeholders: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
      <Placeholder label="Track map" className="h-48" />
      <Placeholder label="Timing tower" className="h-48" />
    </div>
  ),
};

export const ButtonsAndLabels: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Eyebrow>Ready for the next session?</Eyebrow>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline">
          Compare laps <ArrowUpRight />
        </Button>
        <Button>Ask a follow-up</Button>
        <Button variant="ghost">Open evidence</Button>
      </div>
    </div>
  ),
};

// A sketch of the lap-comparison screen, composed only from shared components.
const trace = (offset: number) =>
  Array.from({ length: 60 }, (_, i) => {
    const x = (i / 59) * 100;
    const y = 50 + 30 * Math.sin(i / 6 + offset) + 8 * Math.sin(i / 2.3);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

export const SampleScreen: Story = {
  name: 'Sample screen: lap comparison',
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="mx-auto max-w-5xl">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <p className="font-semibold tracking-tight">RACE ENGINEER</p>
        <nav className="label-mono flex gap-6">
          <span>Session</span>
          <span className="underline underline-offset-8">Compare</span>
          <span className="text-muted-foreground">Strategy</span>
          <span className="text-muted-foreground">Replay</span>
        </nav>
        <Badge variant="outline">Demo mode</Badge>
      </header>
      <div className="grid md:grid-cols-[1fr_2fr]">
        <aside className="flex flex-col gap-6 border-b p-6 md:border-r md:border-b-0">
          <div>
            <Eyebrow>Session</Eyebrow>
            <p className="mt-1 text-sm">Mexico City · Race · 3 cars</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <Stat label="Lap 2" value="1:19.3" />
            <Stat label="Lap 3" value="+0.669" tone="loss" />
          </div>
          <div className="flex flex-col gap-4">
            <Eyebrow>Where the time went</Eyebrow>
            <Annotation index={1} title="T12 area · 0.267 s">
              Min speed 2 km/h lower.
            </Annotation>
            <Annotation index={2} title="T8–T11 · 0.265 s">
              Exit speed 6 km/h lower.
            </Annotation>
            <Annotation index={3} title="T2 area · 0.201 s">
              Min speed 83 vs 95 km/h.
            </Annotation>
          </div>
          <Button variant="outline" className="self-start">
            Open evidence <ArrowUpRight />
          </Button>
        </aside>
        <main className="flex flex-col gap-6 p-6">
          <h1 className="text-4xl font-semibold">Lap 2 vs lap 3</h1>
          <Placeholder label="Track map · time gained / lost" className="h-64" />
          <LineChartFrame title="Speed · km/h" xLabel="Distance · m" yLabel="0–330">
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
            >
              <polyline
                points={trace(0)}
                fill="none"
                stroke="var(--ink)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={trace(0.25)}
                fill="none"
                stroke="var(--reference)"
                strokeWidth="1"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </LineChartFrame>
        </main>
      </div>
    </div>
  ),
};
