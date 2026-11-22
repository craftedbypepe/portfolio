// Runs the eval set.
//   bun run eval                                   recorded answers, $0 (this is what CI runs)
//   bun run eval --live --model claude-haiku-5-5   live calls with local keys, budget-capped
// Options: --model <id> (repeatable), --cases E01,E06, --budget <usd> (default 1), --save (live: update recordings),
//          --write (save the scorecard to evals/results/), --check-baseline (recorded: fail if results changed).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVALS_DIR, loadCases } from '../src/evals/cases.js';
import { assertPriced } from '../src/evals/clients.js';
import { runEvals, scorecard } from '../src/evals/run.js';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => (has(f) ? args[args.indexOf(f) + 1] : undefined);
const models = args.flatMap((a, i) =>
  a === '--model' && args[i + 1] ? [args[i + 1] as string] : [],
);
const mode = has('--live') ? 'live' : 'recorded';
// Default: every model with saved answers (recorded) or the two Claude models (live).
const recorded = readdirSync(join(EVALS_DIR, 'recordings'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const list = models.length
  ? models
  : mode === 'recorded'
    ? recorded
    : ['claude-sonnet-5-5', 'claude-haiku-5-5'];
const cases = loadCases(val('--cases')?.split(','));
const budgetUsd = Number(val('--budget') ?? 1);
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
  console.error(`--budget must be a positive number of dollars, got "${val('--budget')}"`);
  process.exit(1);
}
if (mode === 'live') for (const m of list) assertPriced(m);

console.log(
  `Eval run: ${mode}, ${cases.length} cases × ${list.length} models${mode === 'live' ? `, budget $${budgetUsd}` : ''}`,
);
const { rows, spentUsd } = await runEvals({
  mode,
  models: list,
  cases,
  budgetUsd,
  saveRecordings: has('--save'),
  onProgress: (r) =>
    console.log(
      `${r.pass ? 'PASS' : r.origin === 'missing' ? '----' : 'FAIL'} ${r.model} ${r.caseId}${r.pass || r.origin === 'missing' ? '' : `: ${r.problems[0] ?? ''}`}`,
    ),
});
const title = `Eval scorecard · ${mode} · ${new Date().toISOString().slice(0, 10)}`;
const md = scorecard(rows, title);
console.log(`\n${md}`);
if (mode === 'live') console.log(`Spent: $${spentUsd.toFixed(4)}`);

if (has('--write')) {
  const dir = join(EVALS_DIR, 'results');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  writeFileSync(join(dir, `${mode}-${stamp}.md`), md);
  writeFileSync(
    join(dir, `${mode}-${stamp}.json`),
    `${JSON.stringify({ title, spentUsd, rows }, null, 1)}\n`,
  );
  writeFileSync(join(dir, `latest-${mode}.md`), md);
}

// Recorded mode guards the checker itself: the saved answers are fixed, so any change in results means the
// checker or the cases changed. Update the baseline deliberately with --update-baseline.
const baselinePath = join(EVALS_DIR, 'baseline-recorded.json');
const summary = Object.fromEntries(
  rows.map((r) => [
    `${r.model} ${r.caseId}`,
    r.origin === 'missing' ? 'missing' : r.pass ? 'pass' : 'fail',
  ]),
);
if (mode === 'recorded' && has('--update-baseline')) {
  writeFileSync(baselinePath, `${JSON.stringify(summary, null, 1)}\n`);
  console.log('Baseline updated.');
}
if (mode === 'recorded' && has('--check-baseline')) {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, string>;
  const changed = Object.keys({ ...baseline, ...summary }).filter(
    (k) => baseline[k] !== summary[k],
  );
  if (changed.length) {
    console.error(
      `Recorded results differ from the baseline: ${changed.map((k) => `${k} ${baseline[k] ?? 'new'} → ${summary[k] ?? 'gone'}`).join(', ')}`,
    );
    process.exit(1);
  }
  console.log('Recorded results match the baseline.');
}
