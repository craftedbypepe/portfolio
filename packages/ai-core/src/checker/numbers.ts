// Grounding: every number in an AI answer must exist in the tool data it was given (ported from spike 4).
//
// Allowed conversions, and nothing else:
//   1. sign dropped: "lost 0.27 s" for timeDeltaS +0.267
//   2. rounding to the decimals written: 0.27 ← 0.267, 10 ← 9.6
//   3. ms ↔ s: 79328 ms ↔ 79.328 s
//   4. lap times m:ss.sss are read as seconds: 1:19.328 → 79.328
//   5. "105%" is matched as 105
// Not numbers (removed before checking): corner, sector and car tokens (T12, T8–T11, C8, S2, car-1), list markers ("1."),
// "top 3", "#8". Positions "P3" ARE numbers and must be grounded.

export interface FoundNumber {
  raw: string;
  value: number;
  decimals: number;
}

export interface NumberMatch extends FoundNumber {
  /** Where in the tool data it was found, or null when it isn't there. */
  path: string | null;
}

export interface GroundingResult {
  numbers: number;
  grounded: number;
  ungrounded: string[];
  matches: NumberMatch[];
  pass: boolean;
}

interface Candidate {
  value: number;
  path: string;
}

export const extractNumbers = (text: string): FoundNumber[] => {
  let s = String(text);
  s = s.replace(/\b(\d+):(\d{2}(?:\.\d+)?)\b/g, (_, m: string, sec: string) => {
    const decimals = sec.includes('.') ? (sec.split('.')[1] ?? '').length : 0;
    return ` ${(Number(m) * 60 + Number(sec)).toFixed(decimals)} `;
  });
  s = s
    // Corner ranges: "T8-T11", "T8 – T11", or "T8-11" (no spaces). A spaced dash needs a T/C prefix, so
    // "T12 - 0.9 s" keeps 0.9 as a number to check.
    .replace(/\b[TC]\d+(?:\s*[-–]\s*[TC]\d+|[-–]\d+(?![.\d]))?\b/g, ' ')
    .replace(/\bS[123]\b/g, ' ')
    .replace(/\bcar-\d+\b/g, ' ');
  s = s.replace(/\bP(\d+)\b/g, ' $1 ');
  s = s
    .replace(/^\s*\d+[.)]\s/gm, ' ')
    .replace(/\btop[ -]3\b/gi, ' ')
    .replace(/\b3 (points|places|areas|biggest|largest)\b/gi, ' ')
    .replace(/'\d{2}\b/g, ' ')
    .replace(/#\d+/g, ' ');
  const out: FoundNumber[] = [];
  for (const m of s.matchAll(/(?<![\w.])[-+−]?\d+(?:\.\d+)?/g)) {
    const raw = m[0].replace('−', '-');
    out.push({
      raw,
      value: Math.abs(parseFloat(raw)),
      decimals: raw.includes('.') ? (raw.split('.')[1] ?? '').length : 0,
    });
  }
  return out;
};

/** Every number in a JSON value, with its path (numbers inside strings count too). */
export const numericLeaves = (obj: unknown, out: Candidate[] = [], path = ''): Candidate[] => {
  if (typeof obj === 'number' && Number.isFinite(obj)) out.push({ value: obj, path });
  else if (Array.isArray(obj)) obj.forEach((x, i) => numericLeaves(x, out, `${path}[${i}]`));
  else if (obj && typeof obj === 'object') {
    for (const [k, x] of Object.entries(obj)) numericLeaves(x, out, path ? `${path}.${k}` : k);
  } else if (typeof obj === 'string') {
    for (const n of extractNumbers(obj)) out.push({ value: n.value, path: `${path}(str)` });
  }
  return out;
};

export const candidateSet = (data: unknown): Candidate[] =>
  numericLeaves(data).flatMap(({ value, path }) => {
    const a = Math.abs(value);
    return [
      { value: a, path },
      { value: a / 1000, path: `${path}/1000` },
      { value: a * 1000, path: `${path}*1000` },
    ];
  });

const findCandidate = (n: FoundNumber, cands: readonly Candidate[]): string | null => {
  const tolerance = 0.5 * 10 ** -n.decimals + 1e-9;
  return cands.find((c) => Math.abs(c.value - n.value) <= tolerance)?.path ?? null;
};

export const checkGrounding = (
  text: string,
  data: unknown,
  cands = candidateSet(data),
): GroundingResult => {
  const matches = extractNumbers(text).map((n) => ({ ...n, path: findCandidate(n, cands) }));
  const ungrounded = matches.filter((m) => m.path === null).map((m) => m.raw);
  return {
    numbers: matches.length,
    grounded: matches.length - ungrounded.length,
    ungrounded,
    matches,
    pass: ungrounded.length === 0,
  };
};

/** Resolves a path like "corners[9].minSpeedKmh.delta" or "$.totals.officialDeltaS". */
export const resolvePath = (obj: unknown, path: string): unknown => {
  const tokens =
    String(path)
      .replace(/^\$\.?/, '')
      .match(/[^.[\]]+/g) ?? [];
  let cur: unknown = obj;
  for (const t of tokens) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[/^\d+$/.test(t) ? Number(t) : t];
  }
  return cur;
};

/** True when the evidence value equals the value at its path (sign may be dropped; rounding to its decimals). */
export const evidenceMatches = (data: unknown, path: string, value: number): boolean => {
  const actual = resolvePath(data, path);
  const decimals = (String(value).split('.')[1] ?? '').length;
  return (
    typeof actual === 'number' &&
    Math.abs(Math.abs(actual) - Math.abs(value)) <= 0.5 * 10 ** -decimals + 1e-9
  );
};

/** All text and numbers of an answer, except paths and ids, joined for grounding. */
export const answerText = (o: unknown, out: string[] = []): string[] => {
  if (typeof o === 'string') out.push(o);
  else if (typeof o === 'number') out.push(String(o));
  else if (Array.isArray(o)) o.forEach((x) => answerText(x, out));
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'path' || k === 'sourcePath' || k === 'rank' || k === 'stateId') continue;
      answerText(v, out);
    }
  }
  return out;
};
