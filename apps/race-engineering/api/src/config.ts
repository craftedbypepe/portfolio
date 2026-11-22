// Server settings from the environment. Values never live in code or git.

import { UpstashStore, type GuardrailStore } from './guardrails/store.js';

export interface ServerConfig {
  liveRequested: boolean;
  sessionSecret: string | null;
  turnstileSecret: string | null;
  store: GuardrailStore | null;
}

export const configFromEnv = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  // The Vercel Marketplace names Upstash's variables KV_REST_API_*; plain Upstash uses UPSTASH_REDIS_REST_*.
  const url = env['UPSTASH_REDIS_REST_URL'] ?? env['KV_REST_API_URL'];
  const token = env['UPSTASH_REDIS_REST_TOKEN'] ?? env['KV_REST_API_TOKEN'];
  return {
    liveRequested: env['LIVE_AI_ENABLED'] === 'true',
    sessionSecret: env['SESSION_SECRET'] ?? null,
    turnstileSecret: env['TURNSTILE_SECRET_KEY'] ?? null,
    store: url && token ? new UpstashStore(url, token) : null,
  };
};
