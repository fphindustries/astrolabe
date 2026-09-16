import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EntityId,
} from '@astrolabe/shared';

import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import {
  configureLaunchSector,
  decideTruth,
  proposeLaunchCreation,
  rollLaunchOracle,
  type LaunchRejectedError,
  saveLaunchDraft,
  setLaunchFoundation,
} from './launch-commands.js';
import { readEvents } from './event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;

describe.skipIf(!hasTestDatabase)('Campaign Launch workspace commands (3.1–3.2)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('launch_commands');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  async function campaign(): Promise<CampaignId> {
    const result = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'Lantern Wake',
    });
    return result.campaignId;
  }

  it('saves a typed draft and replaces it on resume', async () => {
    const campaignId = await campaign();
    await saveLaunchDraft(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: { section: 'foundation', snapshot: { premise: 'First draft' } },
    });
    await saveLaunchDraft(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: { section: 'foundation', snapshot: { premise: 'Resumed draft' } },
    });

    expect(project(await readEvents(db.sql, campaignId)).launch.drafts).toEqual({
      foundation: { premise: 'Resumed draft' },
    });
  });

  it('records foundation revisions with the superseded accepted event', async () => {
    const campaignId = await campaign();
    await setLaunchFoundation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      premise: 'A quiet reach',
      settings: DEFAULT_CAMPAIGN_SETTINGS,
    });
    await setLaunchFoundation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      premise: 'A restless reach',
      settings: DEFAULT_CAMPAIGN_SETTINGS,
    });
    const events = await readEvents(db.sql, campaignId);
    const foundations = events.filter((event) => event.type === 'campaign.foundation_set');
    expect(foundations).toHaveLength(2);
    expect(foundations[1]?.payload.supersedesEventId).toBe(foundations[0]?.id);
    expect(project(events).launch.foundation).toMatchObject({ premise: 'A restless reach' });
  });

  it('rolls a truth server-side and revisions cite the earlier decision', async () => {
    const campaignId = await campaign();
    const truth = STARFORGED.truths[0];
    if (truth === undefined) throw new Error('expected a setting truth');
    await decideTruth(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: truth.id,
      resolution: 'rolled',
      rng: { next: () => 0 },
    });
    await decideTruth(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: truth.id,
      resolution: 'leave_open',
    });
    const events = await readEvents(db.sql, campaignId);
    const decisions = events.filter((event) => event.type === 'truth.decided');
    expect(events.filter((event) => event.type === 'oracle.rolled')).toHaveLength(2);
    expect(decisions[1]?.payload.supersedesEventId).toBe(decisions[0]?.id);
    expect(project(events).launch.truthDecisions[truth.id]).toMatchObject({
      resolution: 'leave_open',
    });
  });

  it('stores the selected region baseline and rejects a fabricated one', async () => {
    const campaignId = await campaign();
    const sectorId = newId<EntityId>();
    await configureLaunchSector(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      sector: {
        sectorId,
        name: 'The Quiet Reach',
        region: 'terminus',
        baseline: { settlements: 4, passages: 3 },
      },
    });
    await expect(
      configureLaunchSector(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        sector: {
          sectorId,
          name: 'The Quiet Reach',
          region: 'terminus',
          baseline: { settlements: 1, passages: 1 },
        },
      }),
    ).rejects.toMatchObject({
      reason: 'invalid_sector_baseline',
    } satisfies Partial<LaunchRejectedError>);
    expect(project(await readEvents(db.sql, campaignId)).launch.sector).toMatchObject({
      name: 'The Quiet Reach',
    });
  });

  it('records a launch oracle roll and only permits a proposal grounded in that roll', async () => {
    const campaignId = await campaign();
    const oracle = STARFORGED.oracles.find((candidate) => candidate.name === 'Starship Name');
    if (oracle === undefined) throw new Error('expected the Starship Name oracle');
    const rolled = await rollLaunchOracle(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      oracleId: oracle.id,
      rng: { next: () => 0 },
    });
    const roll = rolled.events.find((event) => event.type === 'oracle.rolled');
    if (roll === undefined) throw new Error('expected oracle roll');
    await proposeLaunchCreation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      targetKind: 'starship',
      targetId: 'shared-starship',
      proposal: 'Use the recorded ship name.',
      rationale: 'The oracle result fits the campaign premise.',
      groundedIn: [roll.id],
    });
    const events = await readEvents(db.sql, campaignId);
    expect(events.some((event) => event.type === 'creation.proposed')).toBe(true);
    expect(project(events).launch.starship).toBeUndefined();
  });
});
