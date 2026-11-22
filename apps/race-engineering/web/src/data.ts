// Loads static demo data: converted sessions and saved AI answers. Works with no API and no keys.

import { MODELS, PROMPT_VERSIONS, demoKey } from '@portfolio/ai-core';
import { SessionSchema, type Session } from '@portfolio/telemetry';

export const HERO = {
  slug: 'mexico-city-race',
  a: { carId: 'car-1', lap: 2 },
  b: { carId: 'car-1', lap: 3 },
} as const;

export interface DebriefPoint {
  area: string;
  timeLostS: number;
  finding: string;
  action: string;
}

export interface SavedDebrief {
  model: string;
  recordedAt: string;
  placeholder: boolean;
  note: string;
  points: DebriefPoint[];
}

const getJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

export const loadSession = async (slug: string): Promise<Session> =>
  SessionSchema.parse(await getJson(`/data/sessions/${slug}/session.json`));

export const loadSavedDebrief = async (
  sessionId: string,
  a: { carId: string; lap: number },
  b: { carId: string; lap: number },
): Promise<SavedDebrief> => {
  const key = await demoKey({
    model: MODELS.savedDemo,
    promptVersion: PROMPT_VERSIONS.debrief,
    payload: { sessionId, a, b },
  });
  return (await getJson(`/data/demo/${key}.json`)) as SavedDebrief;
};

export type ApiMode = { mode: 'live' } | { mode: 'demo'; reason: string };

/** Asks the API whether live AI is available. Any failure means demo mode. */
export const loadMode = async (): Promise<ApiMode> => {
  try {
    const body = (await getJson('/api/health')) as { mode?: string; reason?: string };
    return body.mode === 'live'
      ? { mode: 'live' }
      : { mode: 'demo', reason: body.reason ?? 'unknown' };
  } catch {
    return { mode: 'demo', reason: 'api-unavailable' };
  }
};
