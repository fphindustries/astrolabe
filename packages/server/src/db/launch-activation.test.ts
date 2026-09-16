import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED, type CharacterId } from '@astrolabe/rules';
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EntityId,
} from '@astrolabe/shared';

import { buildLaunchWorkspace } from '../launch/workspace.js';

import { createCampaign } from './campaign-commands.js';
import { createCharacter } from './character-commands.js';
import { readEvents } from './event-store.js';
import {
  acceptLaunchIncident,
  activateLaunch,
  configureLaunchSector,
  decideTruth,
  establishLaunchConnection,
  LaunchRejectedError,
  saveLaunchLocation,
  saveLaunchRoute,
  saveLaunchTrouble,
  saveSharedStarship,
  setLaunchFoundation,
  setStartingSettlement,
} from './launch-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

/**
 * Task 3.8 end to end (A38, A40).
 *
 * `ready.test.ts` proves the validator *can* say yes, but it hand-builds its
 * input. The defect this guards against was in the translation from projected
 * facts to that input, so this drives every fact through its real command and
 * asserts activation succeeds — the one assertion that would have failed while
 * trouble facts were projected and never read.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>() => uuidv7() as T;

const paths = STARFORGED.assets
  .filter((asset) => asset.categoryId === 'path')
  .slice(0, 3)
  .map((asset) => asset.id);
const starshipAsset = STARFORGED.assets.find((asset) => asset.categoryId === 'command_vehicle')!.id;

describe.skipIf(!hasTestDatabase)('activating a ready campaign (3.8, A38, A40)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('launch_activation');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  /** Every fact a launch needs, each through its own command. */
  async function readyCampaign(): Promise<{
    campaignId: CampaignId;
    characterId: CharacterId;
    startingSettlementId: EntityId;
  }> {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'Lantern Wake',
    });

    await setLaunchFoundation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      premise: 'A crew chasing a signal out past the Drift.',
      settings: DEFAULT_CAMPAIGN_SETTINGS,
    });

    // D-162: explicitly left open is a decision, not an omission.
    for (const truth of STARFORGED.truths)
      await decideTruth(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        truthId: truth.id,
        resolution: 'leave_open',
      });

    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: {
        name: 'Vesna Kade',
        callsign: 'Map',
        stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        assets: paths,
      },
      backgroundVow: { title: 'Find the lost colony', rank: 'formidable' },
      launch: {
        appearance: 'Weathered flight jacket',
        backstory: { kind: 'discover_in_play' },
      },
      grantCommandVehicle: false,
    });

    await saveSharedStarship(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      starship: {
        starshipId: newId<EntityId>(),
        name: 'Lantern Wake',
        appearance: 'Old freighter, patched hull',
        history: 'Won in a wager',
        quirks: ['The clocks run slow'],
        integrity: { value: 5, min: 0, max: 5 },
        assetId: starshipAsset,
        modules: [],
      },
    });

    await configureLaunchSector(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      sector: {
        sectorId: newId<EntityId>(),
        name: 'Lantern Reach',
        region: 'expanse',
        baseline: { settlements: 2, passages: 1 },
      },
    });

    const emberHold = newId<EntityId>();
    const stillHarbor = newId<EntityId>();
    await saveLaunchLocation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      location: {
        kind: 'settlement',
        id: emberHold,
        name: 'Ember Hold',
        location: 'deep_space',
        population: 'Hundreds',
        authority: 'Corporate',
        projects: ['Rebuilding the relay'],
        firstLooks: ['Cold corridors, warm voices'],
      },
    });
    await saveLaunchLocation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      location: {
        kind: 'settlement',
        id: stillHarbor,
        name: 'Still Harbor',
        location: 'deep_space',
        population: 'Dozens',
        authority: 'Ineffectual',
        projects: ['Salvage rights'],
      },
    });
    await saveLaunchRoute(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      route: { from: emberHold, to: stillHarbor },
    });
    await setStartingSettlement(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      settlementId: emberHold,
    });

    await saveLaunchTrouble(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      trouble: {
        kind: 'settlement',
        troubleId: newId<EntityId>(),
        ownerId: emberHold,
        text: 'The dock crews have not been paid in three cycles.',
      },
    });
    await saveLaunchTrouble(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      trouble: {
        kind: 'sector',
        troubleId: newId<EntityId>(),
        text: 'The relay grid is failing, one node at a time.',
      },
    });

    await establishLaunchConnection(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      npcName: 'Juno Marr',
      role: 'Dockmaster',
      rank: 'dangerous',
      participants: [characterId],
    });

    await acceptLaunchIncident(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      incident: {
        incidentId: newId<EntityId>(),
        text: 'A distress beacon carries the lost colony’s call sign.',
        citedFactEventIds: [],
        rank: 'formidable',
        rollerId: characterId,
        participants: [characterId],
        openingScene: { title: 'The dock at Ember Hold', locationId: emberHold },
      },
    });

    return { campaignId, characterId, startingSettlementId: emberHold };
  }

  it('reaches ready once every launch fact is accepted through its command', async () => {
    const { campaignId } = await readyCampaign();

    const { state, readiness } = buildLaunchWorkspace(await readEvents(db.sql, campaignId));

    expect(readiness.problems).toEqual([]);
    expect(readiness.ready).toBe(true);
    expect(state.launch.phase).toBe('ready');
  });

  it('begins Session 1 and its scene, and leaves the vow pending (A38)', async () => {
    const { campaignId, characterId } = await readyCampaign();

    const result = await activateLaunch(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
    });

    // The command reporting success is not enough: the events it appended
    // have to be ones the projector actually picks up.
    const { state } = buildLaunchWorkspace(await readEvents(db.sql, campaignId));
    expect(state.launch.phase).toBe('active');
    expect(state.session?.number).toBe(1);
    expect(state.scene?.title).toBe('The dock at Ember Hold');
    expect(state.launch.activation?.sessionId).toBe(
      (result.response as { sessionId?: string } | null)?.sessionId,
    );

    // D-168: activation does not pre-resolve Swear an Iron Vow.
    const events = await readEvents(db.sql, campaignId);
    expect(events.some((event) => event.type === 'move.invoked')).toBe(false);
    const activated = events.find((event) => event.type === 'campaign.activated');
    expect(activated?.payload).toMatchObject({
      pendingVow: { rank: 'formidable', rollerId: characterId, participants: [characterId] },
    });
  });

  it('is one-way: a second activation is refused (A40)', async () => {
    const { campaignId } = await readyCampaign();
    await activateLaunch(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
    });

    await expect(
      activateLaunch(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
      }),
    ).rejects.toThrow(LaunchRejectedError);
  });

  it('refuses to activate while a required fact is missing', async () => {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'Half a campaign',
    });

    await expect(
      activateLaunch(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
      }),
    ).rejects.toThrow(/Complete every launch requirement/);
  });

  it('closes launch commands once active (A40)', async () => {
    const { campaignId } = await readyCampaign();
    await activateLaunch(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
    });

    await expect(
      saveLaunchTrouble(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        trouble: {
          kind: 'sector',
          troubleId: newId<EntityId>(),
          text: 'A late addition.',
        },
      }),
    ).rejects.toThrow(/amendment after launch/);
  });
});
