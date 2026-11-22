// Breakpoints and the standard screenshot viewports (SIE-72). Keep in sync with the @theme block in tokens.css.

/** Min-width breakpoints in px (Tailwind prefixes sm: md: lg: xl: 2xl:). */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;

/** Viewports used for PR screenshots and visual checks, in every project. */
export const SCREENSHOT_VIEWPORTS = [
  {
    name: 'mobile',
    width: 390,
    height: 844,
    note: 'Common phone. Race Engineering is view-only here.',
  },
  { name: 'tablet', width: 834, height: 1194, note: 'Tablet portrait, just above md.' },
  { name: 'laptop', width: 1280, height: 800, note: 'Main target, xl.' },
  { name: 'wide', width: 1536, height: 960, note: 'Large screens, 2xl.' },
] as const;
export type ScreenshotViewport = (typeof SCREENSHOT_VIEWPORTS)[number];
