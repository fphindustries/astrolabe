import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import type { CampaignId, LaunchWorkspaceResponse } from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { uuidv7 } from '../db/uuid.js';
import { buildApp } from '../http/app.js';

import { appendMilestoneOneLog } from './legacy-log.js';

/**
 * A43 on a Milestone 1 log (10.1d, D-206).
 *
 * The frozen log stands in for the commands D-206 retired. It was diffed
 * against their output until 10.1e removed them.
 */

const newId = <T>(): T => uuidv7() as T;

describe.skipIf(!hasTestDatabase)('a Milestone 1 campaign, frozen (10.1d, A43)', () => {
  let db: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDatabase('legacy_log');
    app = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  const workspace = async (campaignId: CampaignId) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}/launch`,
    });
    expect(response.statusCode).toBe(200);
    return response.json<LaunchWorkspaceResponse>();
  };

  it('opens Finish campaign launch with everything it had, while no session exists', async () => {
    const campaignId = newId<CampaignId>();
    const run = await appendMilestoneOneLog(db.sql, { campaignId, name: 'Old', inPlay: false });

    const body = await workspace(campaignId);

    // Open, so the client sends it to Finish campaign launch rather than play.
    expect(body).toMatchObject({ launchOpen: true });
    expect(body.state.launch.phase).toBe('draft');
    // D-183: the legacy truths fold into the same decisions a launch makes.
    expect(Object.keys(body.state.launch.truthDecisions)).toHaveLength(3);
    // D-193: the crew keeps its members, the granted Starship off each sheet.
    expect(Object.keys(body.state.characters)).toEqual(
      expect.arrayContaining(Object.values(run.characters)),
    );
    for (const character of Object.values(body.state.characters))
      expect(character).toMatchObject({ legacyStarshipGrant: true });
    expect(
      Object.values(body.state.entities)
        .filter((entity) => entity.kind === 'location')
        .map((entity) => entity.name),
    ).toEqual(['Deepwater Anchorage', 'Kessel Drift', 'Varga Relay']);
    expect(body.state.sector.routes).toHaveLength(2);
    expect(body.state.tracks[run.vowId]).toMatchObject({ kind: 'vow', rank: 'formidable' });
    // Its blockers are reported, not thrown: what it still needs is the workspace's to say.
    expect(body.readiness.ready).toBe(false);
  });

  it('opens play, launch closed, once it has a session', async () => {
    const campaignId = newId<CampaignId>();
    await appendMilestoneOneLog(db.sql, { campaignId, name: 'Old, in play', inPlay: true });

    const body = await workspace(campaignId);

    expect(body).toMatchObject({ launchOpen: false, closedReason: 'campaign_in_play' });
    // The phase alone would have said `draft` and sent A43 to the wrong screen.
    expect(body.state.launch.phase).toBe('draft');
    expect(body.state.scene?.title).toBe('A beacon at Deepwater Anchorage');
  });
});
