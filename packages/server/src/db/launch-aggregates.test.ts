import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED, type CharacterId } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EntityId,
} from '@astrolabe/shared';

import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { beginSession } from './session-commands.js';
import { createCharacter, LaunchCharacterRejectedError } from './character-commands.js';
import { readEvents } from './event-store.js';
import {
  configureLaunchSector,
  establishLaunchConnection,
  LaunchRejectedError,
  saveLaunchLocation,
  saveLaunchRoute,
  saveSharedStarship,
  setSectorLayout,
  setStartingSettlement,
} from './launch-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

/**
 * Tasks 3R.7c–f: the launch aggregates that shipped in group 3 with no test
 * of their own — the connection (A36), the shared starship (A30), the sector
 * graph (A31–A35) and the crew bounds (A27).
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>() => uuidv7() as T;

const paths = STARFORGED.assets
  .filter((asset) => asset.categoryId === 'path')
  .slice(0, 3)
  .map((asset) => asset.id);
const starshipAsset = STARFORGED.assets.find((asset) => asset.categoryId === 'command_vehicle')!.id;
const moduleAsset = STARFORGED.assets.find((asset) => asset.categoryId === 'module')!.id;

describe.skipIf(!hasTestDatabase)('the launch aggregates', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('launch_aggregates');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  async function campaign(): Promise<CampaignId> {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'Lantern Wake',
    });
    return campaignId;
  }

  async function crewMember(campaignId: CampaignId, name: string, callsign: string) {
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: {
        name,
        callsign,
        stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        assets: paths,
      },
      backgroundVow: { title: 'Find the lost colony', rank: 'formidable' },
      launch: { appearance: 'Weathered jacket', backstory: { kind: 'discover_in_play' } },
      grantCommandVehicle: false,
    });
    return characterId;
  }

  const ship = (overrides: Record<string, unknown> = {}) => ({
    starshipId: newId<EntityId>(),
    name: 'Lantern Wake',
    appearance: 'Old freighter, patched hull',
    history: 'Won in a wager',
    quirks: ['The clocks run slow'],
    integrity: { value: 5, min: 0, max: 5 },
    assetId: starshipAsset,
    modules: [],
    ...overrides,
  });

  const settlement = (id: EntityId, name: string) =>
    ({
      kind: 'settlement',
      id,
      name,
      location: 'deep_space',
      population: 'Hundreds',
      authority: 'Corporate',
      projects: ['Rebuilding the relay'],
    }) as const;

  // 3R.7c — the connection (A36, D-167)
  describe('the starting connection', () => {
    it('establishes an NPC, a shared progress track and the connection, with no roll', async () => {
      const campaignId = await campaign();
      const vesna = await crewMember(campaignId, 'Vesna Kade', 'Map');
      const rook = await crewMember(campaignId, 'Rook Ilari', 'Rook');

      await establishLaunchConnection(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        npcName: 'Juno Marr',
        role: 'Dockmaster',
        rank: 'dangerous',
        participants: [vesna, rook],
      });

      const events = await readEvents(db.sql, campaignId);
      // D-167: the automatic strong hit does not roll, and does not fabricate
      // a roll it then calls automatic.
      expect(events.some((event) => event.type === 'dice.rolled')).toBe(false);
      expect(events.some((event) => event.type === 'oracle.rolled')).toBe(false);
      expect(events.some((event) => event.type === 'move.invoked')).toBe(false);

      const state = project(events);
      expect(state.launch.connection).toMatchObject({
        npcName: 'Juno Marr',
        role: 'Dockmaster',
        rank: 'dangerous',
        automaticStrongHit: true,
        participants: [vesna, rook],
      });

      // One track with a participant list, not one per character.
      const tracks = Object.values(state.tracks).filter((track) =>
        track.title.startsWith('Connection:'),
      );
      expect(tracks).toHaveLength(1);
      expect(Object.values(state.entities).filter((e) => e.kind === 'npc')).toHaveLength(1);
    });

    it('refuses a participant who is not a crew member', async () => {
      const campaignId = await campaign();
      await crewMember(campaignId, 'Vesna Kade', 'Map');

      await expect(
        establishLaunchConnection(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          npcName: 'Juno Marr',
          role: 'Dockmaster',
          rank: 'dangerous',
          participants: [newId<CharacterId>()],
        }),
      ).rejects.toThrow(LaunchRejectedError);
    });

    it('refuses a second connection, directing the player to revise', async () => {
      const campaignId = await campaign();
      const vesna = await crewMember(campaignId, 'Vesna Kade', 'Map');
      const establish = () =>
        establishLaunchConnection(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          npcName: 'Juno Marr',
          role: 'Dockmaster',
          rank: 'dangerous',
          participants: [vesna],
        });
      await establish();

      await expect(establish()).rejects.toThrow(/revise/i);
    });
  });

  // 3R.7d — the shared starship (A30, D-164, D-171)
  describe('the shared starship', () => {
    it('is one campaign aggregate at integrity 5, with modules keeping their owner', async () => {
      const campaignId = await campaign();
      const vesna = await crewMember(campaignId, 'Vesna Kade', 'Map');

      await saveSharedStarship(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        starship: ship({ modules: [{ assetId: moduleAsset, ownerCharacterId: vesna }] }),
      });

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.launch.starship).toMatchObject({
        name: 'Lantern Wake',
        integrity: { value: 5 },
        // D-164: the module is installed on the shared ship but keeps its owner.
        modules: [{ assetId: moduleAsset, ownerCharacterId: vesna }],
      });
    });

    it('does not grant a per-character Starship asset to a launch character (D-171)', async () => {
      const campaignId = await campaign();
      const vesna = await crewMember(campaignId, 'Vesna Kade', 'Map');

      const character = project(await readEvents(db.sql, campaignId)).characters[vesna];
      expect(character?.assets).toEqual(paths);
      expect(character?.assets).not.toContain(starshipAsset);
    });

    it('rejects integrity other than 5, and a module owned by a non-crew member', async () => {
      const campaignId = await campaign();
      await crewMember(campaignId, 'Vesna Kade', 'Map');

      await expect(
        saveSharedStarship(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          starship: ship({ integrity: { value: 4, min: 0, max: 5 } }),
        }),
      ).rejects.toThrow(/integrity 5/i);

      await expect(
        saveSharedStarship(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          starship: ship({
            modules: [{ assetId: moduleAsset, ownerCharacterId: newId<CharacterId>() }],
          }),
        }),
      ).rejects.toThrow(LaunchRejectedError);
    });

    it('revises in place rather than creating a second ship', async () => {
      const campaignId = await campaign();
      await crewMember(campaignId, 'Vesna Kade', 'Map');
      const first = ship();
      await saveSharedStarship(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        starship: first,
      });

      await saveSharedStarship(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        starship: { ...first, name: 'Second Wake' },
      });

      const events = await readEvents(db.sql, campaignId);
      expect(events.filter((event) => event.type === 'starship.established')).toHaveLength(1);
      expect(events.filter((event) => event.type === 'starship.revised')).toHaveLength(1);
      expect(project(events).launch.starship?.name).toBe('Second Wake');
    });
  });

  // 3R.7e — the sector graph (A31–A35)
  describe('the sector graph', () => {
    async function sector(campaignId: CampaignId) {
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
    }

    it('refuses a baseline that does not match the chosen region (A31)', async () => {
      const campaignId = await campaign();

      await expect(
        configureLaunchSector(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          sector: {
            sectorId: newId<EntityId>(),
            name: 'Lantern Reach',
            region: 'expanse',
            // Terminus numbers under an Expanse label.
            baseline: { settlements: 4, passages: 3 },
          },
        }),
      ).rejects.toThrow(/baseline must match/i);
    });

    it('refuses a location before a sector exists, and a route to an unknown place', async () => {
      const campaignId = await campaign();
      const ember = newId<EntityId>();

      await expect(
        saveLaunchLocation(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          location: settlement(ember, 'Ember Hold'),
        }),
      ).rejects.toThrow(LaunchRejectedError);

      await sector(campaignId);
      await saveLaunchLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        location: settlement(ember, 'Ember Hold'),
      });

      await expect(
        saveLaunchRoute(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          route: { from: ember, to: newId<EntityId>() },
        }),
      ).rejects.toThrow(/end at an accepted location/i);
    });

    it('accepts a passage to an off-map exit (A34)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const ember = newId<EntityId>();
      await saveLaunchLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        location: settlement(ember, 'Ember Hold'),
      });

      await saveLaunchRoute(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        route: { from: ember, to: { kind: 'off_map', label: 'The Drift' } },
      });

      expect(project(await readEvents(db.sql, campaignId)).launch.routes).toHaveLength(1);
    });

    it('stores map layout as presentation only, and refuses an unplaceable node (A34)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const ember = newId<EntityId>();
      await saveLaunchLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        location: settlement(ember, 'Ember Hold'),
      });

      await setSectorLayout(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        coordinates: { [ember]: { x: 12, y: 30 } },
      });

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.launch.layout[ember]).toEqual({ x: 12, y: 30 });
      // Moving a node changes the saved layout, not the graph (D-165).
      expect(state.launch.routes).toEqual([]);

      await expect(
        setSectorLayout(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          coordinates: { [newId<EntityId>()]: { x: 1, y: 1 } },
        }),
      ).rejects.toThrow(LaunchRejectedError);
    });

    it('selects a starting settlement, and refuses one that is not a settlement (A35)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const ember = newId<EntityId>();
      const planet = newId<EntityId>();
      await saveLaunchLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        location: settlement(ember, 'Ember Hold'),
      });
      await saveLaunchLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        location: {
          kind: 'planet',
          id: planet,
          name: 'Ember',
          planetClass: 'furnace',
          details: {},
        },
      });

      await setStartingSettlement(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        settlementId: ember,
      });
      expect(project(await readEvents(db.sql, campaignId)).launch.startingSettlementId).toBe(ember);

      await expect(
        setStartingSettlement(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          settlementId: planet,
        }),
      ).rejects.toThrow(LaunchRejectedError);
    });
  });

  // 3R.9b — passage identity (D-174)
  describe('passage identity', () => {
    async function sectorWith(campaignId: CampaignId, ids: readonly EntityId[]) {
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
      for (const [index, id] of ids.entries())
        await saveLaunchLocation(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          location: settlement(id, `Settlement ${index}`),
        });
    }

    it('treats a passage stated the other way round as the same passage', async () => {
      const campaignId = await campaign();
      const a = newId<EntityId>();
      const b = newId<EntityId>();
      await sectorWith(campaignId, [a, b]);

      await saveLaunchRoute(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        route: { from: a, to: b },
      });
      await saveLaunchRoute(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        route: { from: b, to: a },
      });

      // One passage, revised — not two counting twice against the baseline.
      expect(project(await readEvents(db.sql, campaignId)).launch.routes).toHaveLength(1);
    });

    it('recognises a repeated off-map exit, which object identity never could', async () => {
      const campaignId = await campaign();
      const a = newId<EntityId>();
      await sectorWith(campaignId, [a]);
      const drift = { from: a, to: { kind: 'off_map', label: 'The Drift' } } as const;

      await saveLaunchRoute(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        route: drift,
      });
      await saveLaunchRoute(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        route: drift,
      });

      expect(project(await readEvents(db.sql, campaignId)).launch.routes).toHaveLength(1);
    });
  });

  // 3R.10 — the legacy-campaign guard (D-178)
  describe('a campaign already in play', () => {
    it('refuses every launch command once a session has begun', async () => {
      const campaignId = await campaign();
      await beginSession(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        scene: { title: 'The dock at Ember Hold' },
      });

      // Phase is still `draft` — a Milestone 1 campaign has no
      // `campaign.activated` — so only D-178's second condition refuses this.
      expect(project(await readEvents(db.sql, campaignId)).launch.phase).toBe('draft');
      await expect(
        configureLaunchSector(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          sector: {
            sectorId: newId<EntityId>(),
            name: 'Too late',
            region: 'expanse',
            baseline: { settlements: 2, passages: 1 },
          },
        }),
      ).rejects.toThrow(/already in play/i);
    });
  });

  // 3R.7f — crew bounds (A27, D-163, D-171)
  describe('the launch crew', () => {
    it('accepts six characters and refuses a seventh (A27)', async () => {
      const campaignId = await campaign();
      for (let n = 0; n < 6; n++) await crewMember(campaignId, `Crew ${n}`, `C${n}`);

      expect(Object.keys(project(await readEvents(db.sql, campaignId)).characters)).toHaveLength(6);

      await expect(crewMember(campaignId, 'Crew 7', 'C7')).rejects.toThrow(
        LaunchCharacterRejectedError,
      );
    });

    it('refuses a launch character with no background vow (D-163)', async () => {
      const campaignId = await campaign();

      await expect(
        createCharacter(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          draft: {
            name: 'Vesna Kade',
            callsign: 'Map',
            stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
            assets: paths,
          },
          launch: { appearance: 'Weathered jacket', backstory: { kind: 'discover_in_play' } },
          grantCommandVehicle: false,
        }),
      ).rejects.toThrow(LaunchCharacterRejectedError);
    });

    it('refuses a launch character with no appearance (A28)', async () => {
      const campaignId = await campaign();

      await expect(
        createCharacter(db.sql, {
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
          launch: { appearance: '  ', backstory: { kind: 'discover_in_play' } },
          grantCommandVehicle: false,
        }),
      ).rejects.toThrow(/appearance/i);
    });
  });
});
