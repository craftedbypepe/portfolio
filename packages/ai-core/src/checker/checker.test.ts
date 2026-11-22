import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkDebrief,
  checkGrounding,
  checkRadio,
  cornersMentioned,
  repairDebrief,
  trackStatusToMention,
  extractNumbers,
  gateViolations,
  redactForModel,
  resolvePath,
  withChecker,
  type DebriefAnswer,
  type LapComparison,
} from './index.js';

const fixture = (name: string): LapComparison =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../evals/fixtures/payloads', name), 'utf8'),
  ) as LapComparison;
const full1 = fixture('P1.json');
const full4 = fixture('P4.json');
const { trace: _t1, ...P1 } = full1;
const { trace: _t4, ...P4 } = full4;
const p1 = P1 as LapComparison;
const p4 = P4 as LapComparison;

// Ported from spike 4's self-tests (22), plus checks added in SIE-28.
describe('grounding', () => {
  it('accepts exact, rounded, ms↔s, m:ss and sign-dropped numbers', () => {
    expect(checkGrounding('lost 0.267 s', p1).pass).toBe(true);
    expect(checkGrounding('lost 0.27 s', p1).pass).toBe(true);
    expect(checkGrounding('lap 2 was 79.328 s', p1).pass).toBe(true);
    expect(checkGrounding('a 1:19.328', p1).pass).toBe(true);
    expect(checkGrounding('gained 0.111 s in the T3 area', p1).pass).toBe(true);
  });

  it('ignores corner, sector and car tokens and list markers', () => {
    expect(extractNumbers('the T8-T11 area and T12, C8, S2, car-1')).toHaveLength(0);
    expect(checkGrounding('1. the T12 area\n2. the T2 area', p1).pass).toBe(true);
  });

  it('rejects invented numbers and arithmetic', () => {
    expect(checkGrounding('you lost 0.512 s', p1).pass).toBe(false);
    expect(checkGrounding('37.5 km/h slower', p1).pass).toBe(false);
    expect(checkGrounding('0.532 s in total', p1).pass).toBe(false);
  });

  it('resolves evidence paths', () => {
    expect(resolvePath(p1, 'corners[9].timeDeltaS')).toBe(p1.corners[9]?.timeDeltaS);
    expect(resolvePath(p1, '$.totals.officialDeltaS')).toBe(0.669);
  });
});

describe('gates', () => {
  it('finds the longest corner name first, en dash included', () => {
    expect(cornersMentioned('the T8-T11 area then T12', p1)[0]).toBe('T8-T11');
    expect(cornersMentioned('The T8–T11 area', p1)[0]).toBe('T8-T11');
  });

  it('flags braking claims when technique claims are off or the corner is linked', () => {
    expect(
      gateViolations('the C2 area: you start slowing about 10 m later', p4).some((v) =>
        v.startsWith('braking'),
      ),
    ).toBe(true);
    expect(
      gateViolations('the T8-T11 area: brake point 12 m later', p1).some((v) =>
        v.startsWith('braking'),
      ),
    ).toBe(true);
    expect(
      gateViolations('In the C3 area, lap 5 starts slowing about 18.9 m later', p4).some((v) =>
        v.startsWith('braking'),
      ),
    ).toBe(true);
  });

  it('allows an approximate braking observation where it is reportable', () => {
    expect(
      gateViolations('the T2 area: starts slowing about 10 m later', p1).some((v) =>
        v.startsWith('braking'),
      ),
    ).toBe(false);
  });

  it('flags "Turn N", setup and tyre-wear claims, but not refusals', () => {
    expect(gateViolations('Turn 12 was slow', p1).some((v) => v.startsWith('official'))).toBe(true);
    expect(
      gateViolations('add front wing for more downforce', p1).some((v) => v.startsWith('setup')),
    ).toBe(true);
    expect(gateViolations('tyre wear hurt you', p1).some((v) => v.startsWith('setup'))).toBe(true);
    expect(
      gateViolations('Braking points are not reportable here, so I will not comment on them.', p4),
    ).toHaveLength(0);
    // Found in a live eval: a refusal written with a curly apostrophe was read as a claim.
    expect(
      gateViolations(
        'I can\u2019t determine whether you braked later: technique claims are disabled.',
        p4,
      ),
    ).toHaveLength(0);
  });
});

describe('data gates (redactForModel)', () => {
  it('removes traces and braking values when technique claims are off', () => {
    const view = redactForModel(full4);
    expect(view.trace).toBeUndefined();
    expect(view.corners.every((c) => c.brakePointM.a === null && c.brakePointM.b === null)).toBe(
      true,
    );
  });

  it('removes non-reportable metric values but keeps the flags', () => {
    const view = redactForModel(full1);
    const t811 = view.corners.find((c) => c.corner === 'T8-T11')!;
    expect(t811.reportable.minSpeed).toBe(false);
    expect(t811.minSpeedKmh.delta).toBeNull();
    const t12 = view.corners.find((c) => c.corner === 'T12')!;
    expect(t12.timeDeltaS).toBeCloseTo(0.267, 3);
  });
});

const goodDebrief: DebriefAnswer = {
  lapWarning: null,
  points: [
    {
      rank: 1,
      corner: 'T12',
      headline: 'the T12 area: 0.267 s lost',
      driverAction: 'Carry a little more minimum speed through the T12 area.',
      evidence: [{ metric: 'timeDeltaS', value: 0.267, path: 'corners[9].timeDeltaS' }],
    },
    {
      rank: 2,
      corner: 'T8-T11',
      headline: 'the T8-T11 area: 0.265 s lost',
      driverAction: 'Brake 15 m later into the T8-T11 area.',
      evidence: [{ metric: 'timeDeltaS', value: 0.265, path: 'corners[8].timeDeltaS' }],
    },
  ],
  refusals: [],
  summary: 'Most time went in the T12 area.',
};

describe('checkDebrief + policy', () => {
  it('passes a grounded point and flags a bad one', () => {
    const view = redactForModel(full1);
    const check = checkDebrief(goodDebrief, view);
    expect(check.points[0]?.problems).toEqual([]);
    expect(check.points[1]?.problems.length).toBeGreaterThan(0);
    expect(check.pass).toBe(false);
  });

  it('flags evidence pointing at the wrong field', () => {
    const view = redactForModel(full1);
    const wrong: DebriefAnswer = {
      ...goodDebrief,
      points: [
        {
          ...goodDebrief.points[0]!,
          evidence: [{ metric: 'timeDeltaS', value: 0.267, path: 'corners[8].timeDeltaS' }],
        },
      ],
    };
    expect(
      checkDebrief(wrong, view).points[0]?.problems.some((p) => p.startsWith('evidence')),
    ).toBe(true);
  });

  it('regenerates once, then drops failing points', async () => {
    const view = redactForModel(full1);
    let calls = 0;
    const result = await withChecker(
      async () => {
        calls++;
        return goodDebrief;
      },
      (a) => checkDebrief(a, view),
      (a, c) => repairDebrief(a, c, view),
    );
    expect(calls).toBe(2);
    expect(result.repaired).toBe(true);
    expect(result.answer?.points.map((p) => p.corner)).toEqual(['T12']);
  });

  it('stops after the first attempt when it passes', async () => {
    const view = redactForModel(full1);
    const onlyGood = { ...goodDebrief, points: [goodDebrief.points[0]!] };
    const result = await withChecker(
      async () => onlyGood,
      (a) => checkDebrief(a, view),
      (a, c) => repairDebrief(a, c, view),
    );
    expect(result.attempts).toHaveLength(1);
    expect(result.repaired).toBe(false);
  });
});

describe('checkRadio', () => {
  const states = [{ stateId: 'R1', trackStatus: 'VSC', position: 3, gapAhead: { gapS: 0.5 } }];

  it('enforces 12 words, grounding and VSC mention', () => {
    const [ok] = checkRadio(
      { calls: [{ stateId: 'R1', call: 'VSC, VSC. Box this lap. P3, gap 0.5.' }] },
      states,
    );
    expect(ok?.problems).toEqual([]);
    const [bad] = checkRadio(
      {
        calls: [
          {
            stateId: 'R1',
            call: 'Box now, the gap ahead is 0.9 and closing fast, push hard every corner',
          },
        ],
      },
      states,
    );
    expect(bad?.problems.some((p) => p.includes('words'))).toBe(true);
    expect(bad?.problems.some((p) => p.includes('not in this state'))).toBe(true);
    expect(bad?.problems).toContain('VSC not mentioned');
  });

  it('blocks pit-duration and tyre-wear wording', () => {
    const [bad] = checkRadio(
      { calls: [{ stateId: 'R1', call: 'VSC. Tyre wear is high, box.' }] },
      states,
    );
    expect(bad?.problems.some((p) => p.startsWith('banned'))).toBe(true);
  });
});

// Findings from /code-review high on PR #5 (SIE-28).
describe('review fixes', () => {
  it('checks a number that follows a corner and a dash', () => {
    expect(checkGrounding('T12 - 0.9 s lost', p1).pass).toBe(false);
    expect(checkGrounding('T12 -0.9 s', p1).pass).toBe(false);
    expect(extractNumbers('the T8-T11 area, the T8 – T11 area, T8-11')).toHaveLength(0);
  });

  it('only skips real refusals, not any sentence with a negation word', () => {
    expect(
      gateViolations('No question: understeer cost you grip in the T12 area.', p1).length,
    ).toBeGreaterThan(0);
    expect(
      gateViolations('You lost time without the grip to brake later in the T12 area.', p1).length,
    ).toBeGreaterThan(0);
    expect(gateViolations("Braking points aren't reportable here.", p4)).toHaveLength(0);
  });

  it('flags a braking claim that names no corner', () => {
    expect(
      gateViolations('You start slowing later and lose time overall.', p1, []).some((v) =>
        v.startsWith('braking'),
      ),
    ).toBe(true);
  });

  it('treats a null reportable flag as not reportable', () => {
    const data = structuredClone(p1);
    data.corners[9]!.reportable.minSpeed = null;
    expect(redactForModel(data).corners[9]!.minSpeedKmh.delta).toBeNull();
  });

  it('repairs a missing lap warning and an ungrounded summary', () => {
    const data = redactForModel(fixture('P5.json'));
    const answer: DebriefAnswer = {
      lapWarning: null,
      points: [],
      refusals: [],
      summary: 'You lost 9.99 s.',
    };
    const pointFromData = data.corners.find((c) => c.timeDeltaS !== null && c.reportable.time)!;
    answer.points.push({
      rank: 1,
      corner: pointFromData.corner,
      headline: `${pointFromData.areaLabel}: time lost`,
      driverAction: 'Review this area.',
      evidence: [],
    });
    const repaired = repairDebrief(answer, checkDebrief(answer, data), data)!;
    expect(repaired.lapWarning).toMatch(/not representative/i);
    expect(repaired.summary).toBe('');
    expect(checkDebrief(repaired, data).answerProblems).toEqual([]);
  });

  it('requires VSC/SC from the real state fields, only for recent stops', () => {
    const states = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../evals/fixtures/radio-states.json'), 'utf8'),
    ) as { stateId: string }[];
    const need = Object.fromEntries(
      states.map((s) => [s.stateId.slice(0, 2), trackStatusToMention(s)]),
    );
    expect(need['R1']).toEqual({ vsc: true, sc: false });
    expect(need['R2']).toEqual({ vsc: true, sc: false });
    expect(need['R3']).toEqual({ vsc: false, sc: false });
    expect(need['R4']?.sc).toBe(true);
    expect(need['R5']).toEqual({ vsc: false, sc: false });
  });
});
