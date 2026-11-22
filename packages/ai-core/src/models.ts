// Model names live here (and can be overridden by env on the server), never inline in feature code (SIE-64).

export const MODELS = {
  /** Saved portfolio demos: generated once with the best settings. */
  savedDemo: 'claude-sonnet-5-5',
  /** Live mode default: cheap, always behind the runtime checker. */
  liveDefault: 'claude-haiku-5-5',
  /** Race engineer voice. */
  voice: 'gpt-realtime-2.1-mini',
} as const;

export type ModelRole = keyof typeof MODELS;

export const PROMPT_VERSIONS = {
  debrief: 'debrief-b-v1',
} as const;
