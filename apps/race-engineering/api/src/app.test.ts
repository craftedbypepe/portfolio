import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('GET /api/health', () => {
  afterEach(() => {
    delete process.env['LIVE_AI_ENABLED'];
  });

  it('reports demo mode by default', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', mode: 'demo' });
  });

  it('reports live mode only when explicitly enabled', async () => {
    process.env['LIVE_AI_ENABLED'] = 'true';
    const res = await request(createApp()).get('/api/health');
    expect(res.body.mode).toBe('live');
  });
});
