import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { STARFORGED, type AssetId } from '@astrolabe/rules';
import type {
  CampaignListResponse,
  CampaignStateResponse,
  CreateCharacterResponse,
  NarrativeLogResponse,
} from '@astrolabe/shared';

import { playGoldenBeats, type GoldenRun } from '../harness/golden-beats.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';

import { buildApp } from './app.js';

const byCategory = (category: string, n: number) =>
  STARFORGED.assets
    .filter((a) => a.categoryId === category)
    .slice(0, n)
    .map((a) => a.id);

/** A legal set under D-89: two paths plus a companion in the final slot. */
const VALID_ASSETS = [...byCategory('path', 2), ...byCategory('companion', 1)];

function validDraftBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    commandId: crypto.randomUUID(),
    draft: {
      name: 'Nyx Adair',
      callsign: 'Nyx',
      stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
      assets: VALID_ASSETS,
    },
    ...overrides,
  };
}

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

  describe('creating a character (task 3.2)', () => {
    it('writes a character and returns it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${run.campaignId}/characters`,
        payload: validDraftBody(),
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<CreateCharacterResponse>();
      expect(body.characterId).toBeTruthy();

      const state = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${run.campaignId}/state`,
      });
      const stateBody = state.json<CampaignStateResponse>();
      expect(stateBody.state.characters[body.characterId]?.callsign).toBe('Nyx');
    });

    it('writes the background vow in the same command', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${run.campaignId}/characters`,
        payload: validDraftBody({
          backgroundVow: { title: 'Recover what was lost', rank: 'dangerous' },
        }),
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<CreateCharacterResponse>();
      expect(body.vowTrackId).toBeTruthy();
    });

    it('422s a draft the rules reject, with the problems attached', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${run.campaignId}/characters`,
        payload: validDraftBody({
          draft: {
            name: '',
            callsign: 'Nyx',
            stats: { edge: 5, heart: 5, iron: 5, shadow: 5, wits: 5 },
            assets: [] as AssetId[],
          },
        }),
      });
      expect(response.statusCode).toBe(422);
      const body = response.json<{ problems: readonly { code: string }[] }>();
      expect(body.problems.map((p) => p.code)).toContain('name_required');
    });

    it('400s a malformed body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${run.campaignId}/characters`,
        payload: { commandId: 'not-a-uuid' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('404s an unknown campaign', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/campaigns/00000000-0000-0000-0000-000000000000/characters',
        payload: validDraftBody(),
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
