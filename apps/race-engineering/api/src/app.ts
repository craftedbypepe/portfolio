import { MODELS, PROMPT_VERSIONS, demoKey } from '@portfolio/ai-core';
import express, { type Express, type Request } from 'express';
import { z } from 'zod';
import { configFromEnv, type ServerConfig } from './config.js';
import { Guardrails, type DemoReason } from './guardrails/guardrails.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_S,
  issueSessionToken,
  readCookie,
  verifySessionToken,
  visitorId,
} from './guardrails/session.js';
import { verifyTurnstile } from './turnstile.js';

export interface AppOptions {
  config?: ServerConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

const LapRef = z.object({ carId: z.string().max(16), lap: z.number().int().min(1).max(200) });
const DebriefRequest = z.object({ sessionId: z.string().max(64), a: LapRef, b: LapRef });

const clientIp = (req: Request): string =>
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
  req.ip ??
  'unknown';

export const createApp = ({
  config = configFromEnv(),
  now = () => new Date(),
  fetchImpl = fetch,
}: AppOptions = {}): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  const guardrails = new Guardrails(
    config.liveRequested && config.sessionSecret ? config.store : null,
    config.liveRequested,
    now,
  );
  const demo = (reason: DemoReason) => ({ mode: 'demo' as const, reason });

  app.get('/api/health', async (_req, res) => {
    const status = await guardrails.status();
    res.json({ status: 'ok', ...(status.live ? { mode: 'live' } : demo(status.reason)) });
  });

  // Turnstile check → signed live-session cookie. Counts toward the visitor's daily live sessions.
  app.post('/api/session-token', async (req, res) => {
    const status = await guardrails.status();
    if (!status.live) return res.json(demo(status.reason));
    const secret = config.sessionSecret as string;
    const token = z.object({ turnstileToken: z.string().min(1).max(4096) }).safeParse(req.body);
    if (!token.success || !config.turnstileSecret)
      return res.status(403).json(demo('bot-check-failed'));
    const ip = clientIp(req);
    if (
      !(await verifyTurnstile(config.turnstileSecret, token.data.turnstileToken, ip, fetchImpl))
    ) {
      return res.status(403).json(demo('bot-check-failed'));
    }
    if (!(await guardrails.allowNewSession(visitorId(secret, ip))))
      return res.status(429).json(demo('rate-limit'));
    const session = issueSessionToken(secret, now().getTime());
    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: SESSION_TTL_S * 1000,
      path: '/api',
    });
    return res.json({ mode: 'live' });
  });

  // Debrief. Live AI arrives in phase 6; until then every request is answered from the saved demo.
  app.post('/api/debrief', async (req, res) => {
    const parsed = DebriefRequest.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid-request' });
    const key = await demoKey({
      model: MODELS.savedDemo,
      promptVersion: PROMPT_VERSIONS.debrief,
      payload: parsed.data,
    });
    const answer = (reason: DemoReason) => ({ ...demo(reason), demoKey: key });

    const status = await guardrails.status();
    if (!status.live) return res.json(answer(status.reason));
    const sessionId = verifySessionToken(
      config.sessionSecret as string,
      readCookie(req.headers.cookie, SESSION_COOKIE),
      now().getTime(),
    );
    if (!sessionId) return res.json(answer('no-session'));
    if (!(await guardrails.allowRequest(sessionId)))
      return res.status(429).json(answer('rate-limit'));
    return res.json(answer('live-not-built'));
  });

  return app;
};
