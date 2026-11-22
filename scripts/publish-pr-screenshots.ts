// Uploads screenshots to the `pr-assets` branch and adds a viewport × screen table to the PR description (SIE-72).
//
// Usage: bun scripts/publish-pr-screenshots.ts <pr-number> <dir with name-viewport[-dark].png files> [--ticket SIE-n]
//
// Uses the GitHub CLI (the user's account). Images go to pr-assets/pr-<n>/; the table replaces anything between
// the <!-- screenshots:start --> and <!-- screenshots:end --> markers, or is appended to the description.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { SCREENSHOT_VIEWPORTS } from '../packages/ui/src/breakpoints';

const REPO = 'craftedbypepe/portfolio';
const BRANCH = 'pr-assets';
const [pr, dir] = process.argv.slice(2);
const ticket = process.argv.includes('--ticket')
  ? process.argv[process.argv.indexOf('--ticket') + 1]
  : null;
if (!pr || !dir) {
  console.error('Usage: bun scripts/publish-pr-screenshots.ts <pr-number> <dir> [--ticket SIE-n]');
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.png'))
  .sort();
const viewports = SCREENSHOT_VIEWPORTS.map((v) => v.name);
const parse = (f: string) => {
  const m = /^(.+)-(mobile|tablet|laptop|wide)(-dark)?\.png$/.exec(f);
  return m ? { screen: `${m[1]}${m[3] ? ' (dark)' : ''}`, viewport: m[2] as string } : null;
};

for (const f of files) {
  const path = `pr-${pr}/${f}`;
  const sha = (
    await $`gh api repos/${REPO}/contents/${path}?ref=${BRANCH} --jq .sha`.nothrow().quiet()
  ).stdout
    .toString()
    .trim();
  const body = JSON.stringify({
    message: `${ticket ? `${ticket}: ` : ''}Screenshots for PR #${pr}`,
    content: readFileSync(join(dir, f)).toString('base64'),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  });
  await $`gh api -X PUT repos/${REPO}/contents/${path} --input - < ${Buffer.from(body)}`.quiet();
  console.log(`uploaded ${path}`);
}

const screens = [
  ...new Set(files.map((f) => parse(f)?.screen).filter((s): s is string => Boolean(s))),
];
// Version tag per publish, so GitHub's image cache never shows an older or missing image.
const version = Date.now().toString(36);
const raw = (f: string) =>
  `https://raw.githubusercontent.com/${REPO}/${BRANCH}/pr-${pr}/${f}?v=${version}`;
const rows = screens.map((screen) => {
  const cells = viewports.map((vp) => {
    const f = files.find((x) => parse(x)?.screen === screen && parse(x)?.viewport === vp);
    return f
      ? `<a href="${raw(f)}"><img src="${raw(f)}" width="180" alt="${screen} at ${vp}"></a>`
      : '–';
  });
  return `| ${screen} | ${cells.join(' | ')} |`;
});
const sizes = SCREENSHOT_VIEWPORTS.map((v) => `${v.name} ${v.width}×${v.height}`).join(' · ');
const table = [
  '<!-- screenshots:start -->',
  '## Screenshots',
  '',
  `Viewports: ${sizes}. Tap an image for full size.`,
  '',
  `| Screen | ${viewports.join(' | ')} |`,
  `| --- | ${viewports.map(() => '---').join(' | ')} |`,
  ...rows,
  '<!-- screenshots:end -->',
].join('\n');

const current = (
  await $`gh pr view ${pr} -R ${REPO} --json body --jq .body`.quiet()
).stdout.toString();
const marker = /<!-- screenshots:start -->[\s\S]*<!-- screenshots:end -->/;
const next = marker.test(current)
  ? current.replace(marker, table)
  : `${current.trimEnd()}\n\n${table}\n`;
await $`gh pr edit ${pr} -R ${REPO} --body-file - < ${Buffer.from(next)}`.quiet();
console.log(`PR #${pr} description updated with ${files.length} screenshots.`);
