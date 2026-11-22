// Captures screenshots of a local build at the standard viewports (SIE-72).
//
// Usage:
//   bun scripts/screenshots.ts --serve <built dir> [--spa] --out <dir> \
//     --shot <name>=<path> [--shot <name>=<path> ...] [--dark]
//
// Examples:
//   App:       --serve apps/race-engineering/web/dist --spa --shot home=/
//   Storybook: --serve packages/ui/storybook-static --shot sample="/iframe.html?id=sketch-primitives--sample-screen&viewMode=story"
//
// Uses the installed Google Chrome through playwright-core (no browser download). Images are written as
// <out>/<name>-<viewport>[-dark].png. The output folder is git-ignored; publish with publish-pr-screenshots.ts.

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { SCREENSHOT_VIEWPORTS } from '../packages/ui/src/breakpoints';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => args[args.indexOf(name) + 1];
const shots = args.flatMap((a, i) =>
  a === '--shot' && args[i + 1] ? [args[i + 1] as string] : [],
);
const serveDir = value('--serve');
const outDir = value('--out') ?? '.screenshots';
if (!serveDir || shots.length === 0) {
  console.error(
    'Usage: bun scripts/screenshots.ts --serve <dir> [--spa] --out <dir> --shot <name>=<path> [...] [--dark]',
  );
  process.exit(1);
}

const root = resolve(serveDir);
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    const file = join(root, path);
    if (file.startsWith(root) && existsSync(file) && statSync(file).isFile())
      return new Response(Bun.file(file));
    if (flag('--spa')) return new Response(Bun.file(join(root, 'index.html')));
    return new Response('Not found', { status: 404 });
  },
});
const base = `http://localhost:${server.port}`;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const themes = flag('--dark') ? ['light', 'dark'] : ['light'];
try {
  for (const shot of shots) {
    const [name, ...rest] = shot.split('=');
    const path = rest.join('=');
    for (const theme of themes) {
      for (const vp of SCREENSHOT_VIEWPORTS) {
        const page = await browser.newPage({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 2,
        });
        const sep = path.includes('?') ? '&' : '?';
        const url = path.includes('iframe.html')
          ? `${base}${path}${sep}globals=theme:${theme === 'dark' ? 'dark' : 'sketch'}`
          : `${base}${path}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        if (theme === 'dark' && !path.includes('iframe.html')) {
          await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        }
        await page.evaluate(() => document.fonts.ready);
        const file = join(outDir, `${name}-${vp.name}${theme === 'dark' ? '-dark' : ''}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(file);
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  server.stop(true);
}
