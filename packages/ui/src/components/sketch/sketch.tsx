// Sketch-theme primitives (SIE-71): structure drawn with lines, labels in mono, numbered annotations.
// Feature code uses these and the shadcn components; the final design restyles them in one place.

import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Small uppercase mono label, e.g. "LAUNCH YEAR" or "TIME LOST". */
export const Eyebrow = ({ className, ...props }: ComponentProps<'p'>) => (
  <p className={cn('label-mono text-muted-foreground', className)} {...props} />
);

/** L-shaped marks at the four corners of the nearest positioned ancestor. */
export const CropMarks = ({ className }: { className?: string }) => {
  const mark = 'pointer-events-none absolute size-3 border-foreground';
  return (
    <span aria-hidden className={className}>
      <span className={cn(mark, '-top-1.5 -left-1.5 border-t border-l')} />
      <span className={cn(mark, '-top-1.5 -right-1.5 border-t border-r')} />
      <span className={cn(mark, '-bottom-1.5 -left-1.5 border-b border-l')} />
      <span className={cn(mark, '-right-1.5 -bottom-1.5 border-r border-b')} />
    </span>
  );
};

export interface PanelProps extends ComponentProps<'section'> {
  /** Mono label at the top of the panel. */
  label?: ReactNode;
  /** Draw crop marks at the corners instead of a full border. */
  cropped?: boolean;
  /** Dotted-grid background. */
  grid?: boolean;
}

/** A boxed cell: the basic building block of sketch layouts. */
export const Panel = ({
  label,
  cropped = false,
  grid = false,
  className,
  children,
  ...props
}: PanelProps) => (
  <section
    className={cn('relative p-5', cropped ? '' : 'border', grid && 'bg-dot-grid', className)}
    {...props}
  >
    {cropped && <CropMarks />}
    {label !== undefined && <Eyebrow className="mb-3">{label}</Eyebrow>}
    {children}
  </section>
);

export interface StatProps extends ComponentProps<'div'> {
  label: ReactNode;
  value: ReactNode;
  /** Semantic tone for the value. */
  tone?: 'default' | 'gain' | 'loss' | 'info' | 'warning';
}

const toneClass: Record<NonNullable<StatProps['tone']>, string> = {
  default: 'text-foreground',
  gain: 'text-gain',
  loss: 'text-loss',
  info: 'text-info',
  warning: 'text-warning',
};

/** A labelled figure, e.g. "LAP TIME / 1:19.328". */
export const Stat = ({ label, value, tone = 'default', className, ...props }: StatProps) => (
  <div className={cn('flex flex-col gap-2', className)} {...props}>
    <Eyebrow className="border-hairline-soft border-b pb-2">{label}</Eyebrow>
    <p className={cn('font-mono text-3xl font-light tabular-nums', toneClass[tone])}>{value}</p>
  </div>
);

export interface AnnotationProps extends Omit<ComponentProps<'div'>, 'title'> {
  /** 1-based number, shown as "01". */
  index: number;
  title: ReactNode;
  /** Draw a dashed leader line from the number box (points at the thing being annotated). */
  leader?: boolean;
}

/** Numbered callout, used for evidence: "01 · T12 area · 0.267 s lost". */
export const Annotation = ({
  index,
  title,
  leader = false,
  className,
  children,
  ...props
}: AnnotationProps) => (
  <div className={cn('flex gap-3', className)} {...props}>
    <div className="flex shrink-0 items-start">
      <span className="flex size-7 items-center justify-center border font-mono text-xs">
        {String(index).padStart(2, '0')}
      </span>
      {leader && <span aria-hidden className="mt-3.5 w-6 border-t border-dashed" />}
    </div>
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold uppercase tracking-wide">{title}</p>
      {children !== undefined && <div className="text-muted-foreground text-sm">{children}</div>}
    </div>
  </div>
);

export interface PlaceholderProps extends ComponentProps<'div'> {
  /** What will go here, e.g. "Track map". */
  label?: ReactNode;
}

/** An X box for visuals that aren't built yet. */
export const Placeholder = ({ label, className, ...props }: PlaceholderProps) => (
  <div
    className={cn('relative min-h-32 border', className)}
    role="img"
    aria-label={typeof label === 'string' ? `${label} (placeholder)` : 'Placeholder'}
    {...props}
  >
    <svg
      aria-hidden
      className="text-hairline-soft absolute inset-0 size-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <line
        x1="0"
        y1="0"
        x2="100"
        y2="100"
        stroke="currentColor"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="100"
        y1="0"
        x2="0"
        y2="100"
        stroke="currentColor"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
    {label !== undefined && (
      <span className="label-mono bg-background text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2">
        {label}
      </span>
    )}
  </div>
);

export interface LineChartFrameProps extends Omit<ComponentProps<'figure'>, 'title'> {
  /** Mono title in the top-left corner, e.g. "SPEED · KM/H". */
  title: ReactNode;
  xLabel?: ReactNode;
  yLabel?: ReactNode;
}

/** Frame for line-only charts: dotted grid, mono labels. The chart itself goes inside. */
export const LineChartFrame = ({
  title,
  xLabel,
  yLabel,
  className,
  children,
  ...props
}: LineChartFrameProps) => (
  <figure className={cn('relative border p-4', className)} {...props}>
    <figcaption className="label-mono mb-2">{title}</figcaption>
    <div className="bg-dot-grid relative min-h-40">{children}</div>
    {(xLabel !== undefined || yLabel !== undefined) && (
      <div className="label-mono text-muted-foreground mt-2 flex justify-between">
        <span>{yLabel}</span>
        <span>{xLabel}</span>
      </div>
    )}
  </figure>
);
