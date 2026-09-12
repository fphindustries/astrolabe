import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import type {
  CampaignListResponse,
  CampaignStateResponse,
  NarrativeLogResponse,
} from '@astrolabe/shared';

import { playGoldenBeats, type GoldenRun } from '../harness/golden-beats.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';

import { buildApp } from './app.js';

/**
 * The HTTP read API against a real, migrated database (task 5.0).
 *
 * Seeded with the same golden-session beats the harness and section 2's own
 * tests use, so the numbers asserted here are the numbers a person reading
 * the golden session or the harness output would expect.
 */
describe.skipIf(!hasTestDatabase)('the HTTP read API', () => {
  let db: TestDatabase;
  let run: GoldenRun;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDatabase('http-app');
    run = await playGoldenBeats(db.sql);
    app = buildApp({ sql: db.sql });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('lists the seeded campaign', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/campaigns' });
    expect(response.statusCode).toBe(200);
    const body = response.json<CampaignListResponse>();
    expect(body).toContainEqual({ id: run.campaignId, name: 'Lantern Wake' });
  });

  it('projects a campaign’s state', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${run.campaignId}/state`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<CampaignStateResponse>();
    expect(body.state.campaign?.name).toBe('Lantern Wake');
    expect(body.state.session?.number).toBe(2);
    expect(body.headSeq).toBeGreaterThan(0);
    expect(Object.keys(body.state.characters)).toHaveLength(3);
  });

  it('404s an unknown campaign', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/campaigns/00000000-0000-0000-0000-000000000000/state',
    });
    expect(response.statusCode).toBe(404);
  });

  it('400s a malformed campaign id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/campaigns/not-a-uuid/state' });
    expect(response.statusCode).toBe(400);
  });

  it('pages the narrative log', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${run.campaignId}/log?limit=2`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<NarrativeLogResponse>();
    expect(body.beats.length).toBeLessThanOrEqual(2);
    expect(body.beats.length).toBeGreaterThan(0);
  });

  it('400s an invalid log query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${run.campaignId}/log?limit=not-a-number`,
    });
    expect(response.statusCode).toBe(400);
  });
});
