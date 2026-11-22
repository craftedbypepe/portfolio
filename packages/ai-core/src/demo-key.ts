// Demo mode stores each recorded AI answer under a key derived from everything that shaped it.
// The same request always maps to the same saved file, in the browser and on the server.

export interface DemoKeyInput {
  model: string;
  promptVersion: string;
  payload: unknown;
  question?: string;
}

/** JSON with sorted object keys, so equal inputs always serialise the same way. */
export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
};

/** First 16 hex characters of the SHA-256 of the input. Uses Web Crypto (browsers and Node 20+). */
export const demoKey = async (input: DemoKeyInput): Promise<string> => {
  const bytes = new TextEncoder().encode(stableStringify(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};
