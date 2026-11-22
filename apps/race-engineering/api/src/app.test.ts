import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { KILL_SWITCH_KEY } from './guardrails/guardrails.js';
import { issueSessionToken, SESSION_COOKIE } from './guardrails/session.js';
import { MemoryStore } from './guardrails/store.js';

const NOW = new Date('2026-11-22T12:00:00Z');
const SECRET = 'test-secret';
const turnstileOk = (async () => new Response(JSON.stringify({ success: true }))) as typeof fetch;
const turnstileFail = (async () =>
  new Response(JSON.stringify({ success: false }))) as typeof fetch;

const liveApp = (store = new MemoryStore(() => NOW.getTime()), fetchImpl = turnstileOk) =>
  createApp({
    config: { liveRequested: true, sessionSecret: SECRET, turnstileSecret: 'ts', store },
    now: () => NOW,
    fetchImpl,
  });

const debriefBody = {
  sessionId: 'f1-25:abc',
  a: { carId: 'car-1', lap: 2 },
  b: { carId: 'car-1', lap: 3 },
};
const liveCookie = () => `${SESSION_COOKIE}=${issueSessionToken(SECRET, NOW.getTime()).token}`;

describe('GET /api/health', () => {
  it('is in demo mode when live AI is not enabled', async () => {
    const app = createApp({
      config: { liveRequested: false, sessionSecret: null, turnstileSecret: null, store: null },
    });
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ status: 'ok', mode: 'demo', reason: 'disabled' });
  });

  it('is in demo mode when live AI is requested but not configured', async () => {
    const app = createApp({
      config: { liveRequested: true, sessionSecret: null, turnstileSecret: null, store: null },
    });
    const res = await request(app).get('/api/health');
    expect(res.body.reason).toBe('not-configured');
  });

  it('is live when enabled and configured', async () => {
    const res = await request(liveApp()).get('/api/health');
    expect(res.body).toEqual({ status: 'ok', mode: 'live' });
  });

  it('switches to demo when the kill switch is off', async () => {
    const store = new MemoryStore(() => NOW.getTime());
    store.set(KILL_SWITCH_KEY, 'false');
    const res = await request(liveApp(store)).get('/api/health');
    expect(res.body.reason).toBe('kill-switch');
  });

  it('switches to demo when the daily cap is reached', async () => {
    const store = new MemoryStore(() => NOW.getTime());
    store.set('spend:day:2026-11-22', String(1_000_000));
    expect((await request(liveApp(store)).get('/api/health')).body.reason).toBe('daily-cap');
  });

  it('switches to demo when the monthly cap is reached', async () => {
    const store = new MemoryStore(() => NOW.getTime());
    store.set('spend:month:2026-11', String(8_000_000));
    expect((await request(liveApp(store)).get('/api/health')).body.reason).toBe('monthly-cap');
  });
});

describe('POST /api/session-token', () => {
  it('rejects a failed bot check', async () => {
    const res = await request(liveApp(undefined, turnstileFail))
      .post('/api/session-token')
      .send({ turnstileToken: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('bot-check-failed');
  });

  it('issues an httpOnly cookie, at most 3 sessions per visitor per day', async () => {
    const app = liveApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/session-token').send({ turnstileToken: 'ok' });
      expect(res.body.mode).toBe('live');
      expect(res.headers['set-cookie']?.[0]).toMatch(/re_live=.*HttpOnly/);
    }
    const fourth = await request(app).post('/api/session-token').send({ turnstileToken: 'ok' });
    expect(fourth.status).toBe(429);
    expect(fourth.body.reason).toBe('rate-limit');
  });
});

describe('POST /api/debrief', () => {
  it('rejects invalid input', async () => {
    const res = await request(liveApp()).post('/api/debrief').send({ sessionId: 'x' });
    expect(res.status).toBe(400);
  });

  it('answers from the saved demo with a stable key when live AI is off', async () => {
    const app = createApp({
      config: { liveRequested: false, sessionSecret: null, turnstileSecret: null, store: null },
    });
    const a = await request(app).post('/api/debrief').send(debriefBody);
    const b = await request(app).post('/api/debrief').send(debriefBody);
    expect(a.body.mode).toBe('demo');
    expect(a.body.demoKey).toMatch(/^[0-9a-f]{16}$/);
    expect(b.body.demoKey).toBe(a.body.demoKey);
  });

  it('needs a live session cookie', async () => {
    const res = await request(liveApp()).post('/api/debrief').send(debriefBody);
    expect(res.body.reason).toBe('no-session');
  });

  it('limits AI requests to 10 per session per hour', async () => {
    const app = liveApp();
    const cookie = liveCookie();
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/debrief').set('Cookie', cookie).send(debriefBody);
      expect(res.body.reason).toBe('live-not-built');
    }
    const eleventh = await request(app)
      .post('/api/debrief')
      .set('Cookie', cookie)
      .send(debriefBody);
    expect(eleventh.status).toBe(429);
  });
});
