// Signed live-session cookie and anonymous visitor IDs. No accounts, no personal data stored.

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 're_live';
export const SESSION_TTL_S = 2 * 3_600;

const sign = (secret: string, data: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

export const issueSessionToken = (secret: string, nowMs: number): { id: string; token: string } => {
  const id = randomUUID();
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_S;
  const data = `${id}.${exp}`;
  return { id, token: `${data}.${sign(secret, data)}` };
};

/** Returns the session ID if the token is genuine and not expired. */
export const verifySessionToken = (
  secret: string,
  token: string | undefined,
  nowMs: number,
): string | null => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts as [string, string, string];
  const expected = Buffer.from(sign(secret, `${id}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) * 1000 <= nowMs) return null;
  return id;
};

/** Visitor ID from the IP, salted, so raw IPs are never stored. */
export const visitorId = (secret: string, ip: string): string =>
  createHash('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 24);

export const readCookie = (header: string | undefined, name: string): string | undefined =>
  header
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1];
