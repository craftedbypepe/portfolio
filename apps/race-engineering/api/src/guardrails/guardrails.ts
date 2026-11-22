// Cost guardrails from spike 8. Any limit or missing setup sends the visitor to demo mode.

import type { GuardrailStore } from './store.js';

export const LIMITS = {
  liveSessionsPerVisitorPerDay: 3,
  aiRequestsPerSessionPerHour: 10,
  dailyCapUsd: 1,
  monthlyCapUsd: 8,
} as const;

export type DemoReason =
  | 'disabled'
  | 'not-configured'
  | 'kill-switch'
  | 'daily-cap'
  | 'monthly-cap'
  | 'rate-limit'
  | 'no-session'
  | 'bot-check-failed'
  | 'live-not-built'
  | 'error';

export type LiveStatus = { live: true } | { live: false; reason: DemoReason };

export const KILL_SWITCH_KEY = 'live:enabled';
const DAY_S = 86_400;
const day = (now: Date) => now.toISOString().slice(0, 10);
const month = (now: Date) => now.toISOString().slice(0, 7);
const hour = (now: Date) => now.toISOString().slice(0, 13);
const MICRO = 1_000_000;

export class Guardrails {
  constructor(
    private readonly store: GuardrailStore | null,
    private readonly liveRequested: boolean,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Whether live AI may run right now, before any per-visitor checks. */
  async status(): Promise<LiveStatus> {
    if (!this.liveRequested) return { live: false, reason: 'disabled' };
    if (!this.store) return { live: false, reason: 'not-configured' };
    try {
      if ((await this.store.get(KILL_SWITCH_KEY)) === 'false')
        return { live: false, reason: 'kill-switch' };
      const now = this.now();
      const daySpend = Number((await this.store.get(`spend:day:${day(now)}`)) ?? 0) / MICRO;
      if (daySpend >= LIMITS.dailyCapUsd) return { live: false, reason: 'daily-cap' };
      const monthSpend = Number((await this.store.get(`spend:month:${month(now)}`)) ?? 0) / MICRO;
      if (monthSpend >= LIMITS.monthlyCapUsd) return { live: false, reason: 'monthly-cap' };
      return { live: true };
    } catch {
      return { live: false, reason: 'error' };
    }
  }

  /** Counts a new live session for a visitor; false once they reach the daily limit. */
  async allowNewSession(visitor: string): Promise<boolean> {
    if (!this.store) return false;
    const n = await this.store.incrBy(`sessions:${visitor}:${day(this.now())}`, 1, DAY_S);
    return n <= LIMITS.liveSessionsPerVisitorPerDay;
  }

  /** Counts an AI request within a live session; false once the hourly limit is reached. */
  async allowRequest(sessionId: string): Promise<boolean> {
    if (!this.store) return false;
    const n = await this.store.incrBy(`requests:${sessionId}:${hour(this.now())}`, 1, 3_600);
    return n <= LIMITS.aiRequestsPerSessionPerHour;
  }

  /** Adds the cost of a finished AI call to today's and this month's totals. */
  async recordSpend(usd: number): Promise<void> {
    if (!this.store || usd <= 0) return;
    const now = this.now();
    await this.store.incrBy(`spend:day:${day(now)}`, usd * MICRO, 2 * DAY_S);
    await this.store.incrBy(`spend:month:${month(now)}`, usd * MICRO, 35 * DAY_S);
  }
}
