import type { Meta, StoryObj } from '@storybook/react-vite';

// Token reference pages. Values come from src/styles/tokens.css; switch the theme in the toolbar.
const meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const colours = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'primary-foreground',
  'secondary',
  'muted',
  'muted-foreground',
  'accent',
  'destructive',
  'border',
  'input',
  'ring',
  'gain',
  'loss',
  'warning',
];

export const Colour: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {colours.map((name) => (
        <div key={name} className="flex items-center gap-3">
          <div
            className="size-10 shrink-0 rounded-md border"
            style={{ background: `var(--${name})` }}
          />
          <code className="text-xs">--{name}</code>
        </div>
      ))}
    </div>
  ),
};

const typeSteps = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'];

export const Type: Story = {
  render: () => (
    <div className="space-y-3">
      {typeSteps.map((step) => (
        <div key={step} className="flex items-baseline gap-4">
          <code className="text-muted-foreground w-24 shrink-0 text-xs">--type-{step}</code>
          <span style={{ fontSize: `var(--type-${step})` }}>Lap 3 · 1:18.792</span>
        </div>
      ))}
      <div className="flex items-baseline gap-4">
        <code className="text-muted-foreground w-24 shrink-0 text-xs">--family-mono</code>
        <span className="font-mono">+0.669 s</span>
      </div>
    </div>
  ),
};

const spaceSteps = [1, 2, 3, 4, 6, 8, 12, 16];

export const Spacing: Story = {
  render: () => (
    <div className="space-y-2">
      {spaceSteps.map((step) => (
        <div key={step} className="flex items-center gap-4">
          <code className="text-muted-foreground w-28 shrink-0 text-xs">{step} × --space-unit</code>
          <div className="bg-primary h-3" style={{ width: `calc(var(--space-unit) * ${step})` }} />
        </div>
      ))}
    </div>
  ),
};

export const RadiusAndElevation: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div
          key={size}
          className="bg-card flex size-24 items-center justify-center rounded-lg border text-xs"
          style={{ boxShadow: `var(--elevation-${size})` }}
        >
          elevation-{size}
        </div>
      ))}
    </div>
  ),
};

const durations = ['fast', 'base', 'slow'];
const easings = ['standard', 'emphasized', 'exit'];

export const Motion: Story = {
  render: () => (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">Hover a row to see the motion token in use.</p>
      {durations.map((d) =>
        easings.map((e) => (
          <div key={`${d}-${e}`} className="group flex items-center gap-4">
            <code className="text-muted-foreground w-56 shrink-0 text-xs">
              --duration-{d} · --easing-{e}
            </code>
            <div className="bg-muted h-3 w-48 overflow-hidden rounded">
              <div
                className="bg-primary h-full w-1/4 group-hover:translate-x-[300%]"
                style={{
                  transitionProperty: 'transform',
                  transitionDuration: `var(--duration-${d})`,
                  transitionTimingFunction: `var(--easing-${e})`,
                }}
              />
            </div>
          </div>
        )),
      )}
    </div>
  ),
};
