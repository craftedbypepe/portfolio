// Gates: claims the AI must never make, checked sentence by sentence (ported from spike 4).
// Sentences that refuse or negate ("braking points aren't reportable here") are not flagged.

import type { LapComparison } from './lap-comparison.js';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const BRAKING_CLAIM =
  /(brak\w*|slow\w*|lift\w*)(?:[^.;\n]|\.(?=\d)){0,40}\b(later|earlier|sooner|deeper)\b|\bbrak\w* (point|marker)|\b(later|earlier|deeper) on the brakes/i;
export const SETUP_CLAIM =
  /\b(downforce|front wing|rear wing|setup|set-up|differential|ride height|camber|tyre pressure|tire pressure|brake bias|tyre wear|tire wear|degradation|traction control|ERS|fuel|temperatures?|understeer|oversteer|lock[- ]?ups?|locked|wheelspin|grip)\b/i;
export const GENERIC_COACHING =
  /\b(brake later|carry more (speed|momentum)|be smoother|push harder|attack more|more aggressive|commit more|be more confident)\b/i;
/**
 * A sentence that declines to make a claim ("braking points aren't reportable here", "I can't determine…").
 * A negation word alone isn't enough: "No question: understeer cost you grip" is still a claim.
 */
export const REFUSAL =
  /\b(not|no|never|can't|cannot|isn't|aren't|won't|don't|doesn't)\b[^.;\n]{0,50}\b(reportable|allowed|available|enabled|reliable|comment|claim|say|determine|tell|advise|give|quote|state|confirm|enough data)\b|\b(refus\w*|withheld|blocked|unavailable|not reportable|disabled)\b/i;
/** Strategy and radio wording rules (PRD v2). */
export const BANNED_STRATEGY_WORDING =
  /pit stop duration|stop took|tyre wear|tire wear|degradation|\bdeg\b|\bwear\b/i;
export const LAP_WARNING = /invalid|105|not representative|unrepresentative|standing[- ]start/i;

/** Splits into sentences. Curly apostrophes become straight ones so "can’t" reads as a refusal. */
export const sentences = (s: string): string[] =>
  String(s)
    .replace(/[\u2018\u2019]/g, "'")
    .split(/(?<=[.!?;])\s+|\n+/)
    .filter((x) => x.trim());

/** Corner names mentioned in text, longest first so "T8-T11" wins over "T8"; in order of first appearance. */
export const cornersMentioned = (text: string, p: LapComparison): string[] => {
  const t = String(text).replace(/[–—]/g, '-');
  const names = p.corners.map((c) => c.corner).sort((a, b) => b.length - a.length);
  const hits: { name: string; at: number; len: number }[] = [];
  for (const name of names) {
    const re = new RegExp(
      name === 'Start straight'
        ? '\\bstart(?:ing)?[- ]straight\\b|\\bmain straight\\b'
        : `(?<![\\w-])${escape(name)}(?![\\w-])`,
      'gi',
    );
    for (const m of t.matchAll(re)) {
      const at = m.index ?? 0;
      if (!hits.some((h) => at >= h.at && at < h.at + h.len))
        hits.push({ name, at, len: m[0].length });
    }
  }
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.name))];
};

/** Gate violations in a debrief text. contextCorners: the corner the text is about, when it doesn't name one. */
export const gateViolations = (
  text: string,
  p: LapComparison,
  contextCorners: readonly string[] = [],
): string[] => {
  const out: string[] = [];
  for (const sentence of sentences(text)) {
    if (/\bturn\s+\d+/i.test(sentence)) out.push('official turn number ("Turn N")');
    if (REFUSAL.test(sentence)) continue;
    if (BRAKING_CLAIM.test(sentence)) {
      const named = cornersMentioned(sentence, p);
      const scope = named.length ? named : contextCorners;
      const bad = !p.quality.techniqueClaimsAllowed
        ? 'technique claims not allowed'
        : scope.length === 0
          ? 'not tied to a corner where braking is reportable'
          : scope.find((name) => {
              const c = p.corners.find((x) => x.corner === name);
              return !c || c.linked || c.reportable.brakePoint !== true;
            });
      if (bad) out.push(`braking claim (${bad}): "${sentence.slice(0, 90)}"`);
    }
    const setup = SETUP_CLAIM.exec(sentence);
    if (setup) out.push(`setup or physics claim "${setup[0]}": "${sentence.slice(0, 90)}"`);
  }
  return out;
};

export const genericCoaching = (text: string): string[] =>
  sentences(text).filter((s) => !REFUSAL.test(s) && GENERIC_COACHING.test(s));
