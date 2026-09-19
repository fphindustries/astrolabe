import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AstrolabeEvent, CampaignId, CampaignState } from '@astrolabe/shared';

import { readEvents } from '../db/event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { project } from '../projection/project.js';

import { fixtureUuid } from './ids.js';
import {
  LANTERN_WAKE_LAUNCH,
  playLanternWakeLaunch,
  type LaunchRun,
} from './lantern-wake-launch.js';

/**
 * The golden launch as an automated test (10.2, A22–A44, D-205).
 *
 * `playLanternWakeLaunch` plays beats 1–13 through the HTTP routes and throws
 * on anything that goes wrong along the way. This reads back what it wrote.
 */
describe.skipIf(!hasTestDatabase)('the golden launch, end to end (10.2, D-205)', () => {
  let db: TestDatabase;
  let run: LaunchRun;
  let events: readonly AstrolabeEvent[];
  let state: CampaignState;

  beforeAll(async () => {
    db = await createTestDatabase('golden_launch');
    run = await playLanternWakeLaunch(db.sql, {
      fixture: LANTERN_WAKE_LAUNCH,
      campaignId: fixtureUuid<CampaignId>(LANTERN_WAKE_LAUNCH, 'campaign'),
      campaignName: 'Lantern Wake',
    });
    events = await readEvents(db.sql, run.campaignId);
    state = project(events);
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it('launches Lantern Wake and swears its vow (A38, A39)', () => {
    expect(state.launch.phase).toBe('active');
    expect(state.launch.activation?.vowTrackId).toBe(run.vowId);
  });
});
