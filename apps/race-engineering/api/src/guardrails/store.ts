// Where guardrail counters and the kill switch live: Upstash Redis in production, memory in tests and local dev.

export interface GuardrailStore {
  get(key: string): Promise<string | null>;
  /** Increments a counter and (on first write) sets its expiry. Returns the new value. */
  incrBy(key: string, by: number, ttlS: number): Promise<number>;
}

export class MemoryStore implements GuardrailStore {
  private readonly values = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private readonly now: () => number = Date.now) {}

  set(key: string, value: string): void {
    this.values.set(key, { value, expiresAt: null });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async incrBy(key: string, by: number, ttlS: number): Promise<number> {
    const current = Number((await this.get(key)) ?? 0) + by;
    const existing = this.values.get(key);
    this.values.set(key, {
      value: String(current),
      expiresAt: existing?.expiresAt ?? this.now() + ttlS * 1000,
    });
    return current;
  }
}

/** Minimal Upstash REST client (no SDK needed for two commands). */
export class UpstashStore implements GuardrailStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await this.fetchImpl(`${this.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Upstash request failed: ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string }[];
    return body.map((r) => {
      if (r.error) throw new Error(`Upstash error: ${r.error}`);
      return r.result;
    });
  }

  async get(key: string): Promise<string | null> {
    const [value] = await this.pipeline([['GET', key]]);
    return typeof value === 'string' ? value : null;
  }

  async incrBy(key: string, by: number, ttlS: number): Promise<number> {
    const [value] = await this.pipeline([
      ['INCRBY', key, Math.round(by)],
      ['EXPIRE', key, ttlS, 'NX'],
    ]);
    return Number(value);
  }
}
