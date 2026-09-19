import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { readEvents } from './event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const CATACLYSM = STARFORGED.truths.find((t) => t.name === 'Cataclysm');
if (CATACLYSM === undefined) {
  throw new Error('expected the Cataclysm truth to exist');
}

describe.skipIf(!hasTestDatabase)('creating a campaign (task 4.1, task 4.5)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('campaigns');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it('writes a campaign with the default settings', async () => {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'Lantern Wake',
    });

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.campaign?.name).toBe('Lantern Wake');
    expect(state.campaign?.settings).toEqual({
      narrationLatitude: 'color',
      narrationLength: 'standard',
      rerollCap: 2,
    });
  });

  it('trims the name it stores', async () => {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: '  Fresh Signal  ',
    });

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.campaign?.name).toBe('Fresh Signal');
  });

  it('overrides only the settings given, defaulting the rest', async () => {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'Quiet Reach',
      settings: { rerollCap: 0 },
    });

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.campaign?.settings).toEqual({
      narrationLatitude: 'color',
      narrationLength: 'standard',
      rerollCap: 0,
    });
  });

  it('is idempotent on a retry', async () => {
    const campaignId = newId<CampaignId>();
    const commandId = newId<CommandId>();
    const request = { campaignId, commandId, actor: PLAYER, name: 'Retried Signal' };

    const first = await createCampaign(db.sql, request);
    expect(first.result.replayed).toBe(false);

    // A retry reuses the same campaignId, so it collides on campaigns.id
    // rather than silently writing a second campaign (see
    // campaign-commands.ts's note: this is not a full replay — it throws —
    // but the property that matters is that nothing gets duplicated).
    await expect(createCampaign(db.sql, request)).rejects.toThrow();

    const rows = await db.sql`select id from campaigns where name = 'Retried Signal'`;
    expect(rows).toHaveLength(1);
  });
});
