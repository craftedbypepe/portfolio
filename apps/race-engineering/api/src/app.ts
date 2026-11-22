import express, { type Express } from 'express';

// Live AI stays off until the guardrails (SIE-69) are in place; every route answers in demo mode.
const liveAiEnabled = (): boolean => process.env['LIVE_AI_ENABLED'] === 'true';

export const createApp = (): Express => {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mode: liveAiEnabled() ? 'live' : 'demo' });
  });

  return app;
};

export default createApp();
