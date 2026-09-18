import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED, type CharacterId } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EntityId,
  type EventId,
  type SharedStarshipDetails,
  STARSHIP_PROPOSAL_TARGET,
} from '@astrolabe/shared';

import { buildLaunchWorkspace } from '../launch/workspace.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { beginSession } from './session-commands.js';
import { createCharacter, LaunchCharacterRejectedError } from './character-commands.js';
import { readEvents } from './event-store.js';
import {
  configureLaunchSector,
  establishLaunchConnection,
  LaunchRejectedError,
  proposeLaunchCreation,
  removeLaunchLocation,
  removeLaunchRoute,
  rollLaunchRecipe,
  saveLaunchLocation,
  saveLaunchRoute,
  saveSharedStarship,
  type SaveLaunchLocationRequest,
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
    });
    return characterId;
  }

  const ship = (overrides: Partial<SharedStarshipDetails> = {}): SharedStarshipDetails => ({
    name: 'Lantern Wake',
    appearance: 'Old freighter, patched hull',
    history: 'Won in a wager',
    quirks: ['The clocks run slow'],
    ...overrides,
  });

  const settlement = (name: string) =>
    ({
      kind: 'settlement',
      name,
      location: 'deep_space',
      population: 'Hundreds',
      authority: 'Corporate',
      projects: ['Rebuilding the relay'],
    }) as const;

  /** Add a node and return the id the server minted for it (8.0a). */
  async function addLocation(
    campaignId: CampaignId,
    location: SaveLaunchLocationRequest['location'],
  ): Promise<EntityId> {
    const result = await saveLaunchLocation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      location,
    });
    return (result.response as { locationId: EntityId }).locationId;
  }

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
    it('is one campaign aggregate at integrity 5, storing no module list (D-191)', async () => {
      const campaignId = await campaign();
      await crewMember(campaignId, 'Vesna Kade', 'Map');

      await saveSharedStarship(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        starship: ship(),
      });

      const events = await readEvents(db.sql, campaignId);
      const state = project(events);
      expect(state.launch.starship).toMatchObject({
        name: 'Lantern Wake',
        integrity: { value: 5 },
      });
      // Installed modules come from the crew, so the ship states none.
      expect(state.launch.starship).not.toHaveProperty('modules');
      const established = events.find((event) => event.type === 'starship.established');
      expect(established?.payload).not.toHaveProperty('modules');
    });

    it('does not grant a per-character Starship asset to a launch character (D-171)', async () => {
      const campaignId = await campaign();
      const vesna = await crewMember(campaignId, 'Vesna Kade', 'Map');

      const character = project(await readEvents(db.sql, campaignId)).characters[vesna];
      expect(character?.assets).toEqual(paths);
      expect(character?.assets).not.toContain(starshipAsset);
    });

    // 7.0a — the id, asset and integrity are the server's, not the request's.
    it('mints the ship id once and stamps the rules asset and integrity', async () => {
      const campaignId = await campaign();
      await crewMember(campaignId, 'Vesna Kade', 'Map');

      const first = await saveSharedStarship(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        starship: ship(),
      });
      const second = await saveSharedStarship(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        starship: ship({ name: 'Second Wake' }),
      });

      const events = await readEvents(db.sql, campaignId);
      const established = events.find((event) => event.type === 'starship.established');
      const revised = events.find((event) => event.type === 'starship.revised');
      if (established?.type !== 'starship.established' || revised?.type !== 'starship.revised')
        throw new Error('expected an established and a revised ship');
      // One aggregate: the revision cannot carry a different id.
      expect(revised.payload.starship.starshipId).toBe(established.payload.starshipId);
      expect(first.response).toEqual({ starshipId: established.payload.starshipId });
      expect(second.response).toEqual(first.response);
      for (const stamped of [established.payload, revised.payload.starship]) {
        expect(stamped.assetId).toBe(starshipAsset);
        expect(stamped.integrity).toEqual({ value: 5, min: 0, max: 5 });
      }
    });

    // 7.0c — acceptance names the proposal; the server decides the rest.
    describe('accepting a ship proposal', () => {
      async function proposed(campaignId: CampaignId) {
        const rolled = await rollLaunchRecipe(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          selector: { kind: 'starship', quirkCount: 2 },
          rng: { next: () => 0 },
        });
        const [name, history, quirk1, quirk2] = rolled.events.map((event) => event.id);
        const result = await proposeLaunchCreation(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          targetId: STARSHIP_PROPOSAL_TARGET,
          rationale: 'Read off the rolls.',
          groundedIn: [name!, history!, quirk1!, quirk2!],
          proposal: {
            targetKind: 'starship',
            proposal: {
              name: { value: 'Lantern Wake', reason: 'The rolled name.', groundedIn: [name!] },
              appearance: { value: 'A patched hull.', reason: 'From the history.' },
              history: { value: 'Won in a wager.', reason: 'The roll.', groundedIn: [history!] },
              quirks: [
                { value: 'Its clocks run slow.', reason: 'The roll.', groundedIn: [quirk1!] },
                { value: 'The hatch sticks.', reason: 'The roll.', groundedIn: [quirk2!] },
              ],
            },
          },
        });
        return { proposalEventId: result.events[0]!.id, name, history, quirk1, quirk2 };
      }
      const asProposed = ship({
        name: 'Lantern Wake',
        appearance: 'A patched hull.',
        history: 'Won in a wager.',
        quirks: ['Its clocks run slow.', 'The hatch sticks.'],
      });

      it('records an unchanged acceptance as the Guide proposal, caused by it', async () => {
        const campaignId = await campaign();
        const { proposalEventId, name, history, quirk1, quirk2 } = await proposed(campaignId);

        const result = await saveSharedStarship(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          starship: asProposed,
          proposalEventId,
        });

        expect(result.events[0]?.causedBy).toBe(proposalEventId);
        const events = await readEvents(db.sql, campaignId);
        expect(project(events).launch.starship).toMatchObject({
          provenance: 'guide_proposal',
          groundedIn: [name, history, quirk1, quirk2],
        });
        // A41: the rolls resolve to chips the Starship step can show.
        const chips = buildLaunchWorkspace(events).chips;
        for (const id of [name, history, quirk1, quirk2]) expect(chips[id!]).toBeDefined();
      });

      it('records an edit, and cites only the rolls behind the fields kept', async () => {
        const campaignId = await campaign();
        const { proposalEventId, name, history, quirk1 } = await proposed(campaignId);

        // Beat 6: keep one quirk, edit the appearance.
        await saveSharedStarship(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          starship: {
            ...asProposed,
            appearance: 'Scorched plating.',
            quirks: ['Its clocks run slow.'],
          },
          proposalEventId,
        });

        expect(project(await readEvents(db.sql, campaignId)).launch.starship).toMatchObject({
          provenance: 'guide_proposal_edited',
          groundedIn: [name, history, quirk1],
        });
      });

      it('refuses a proposal that is not the held one, and grounding that is not a roll', async () => {
        const campaignId = await campaign();
        await proposed(campaignId);

        await expect(
          saveSharedStarship(db.sql, {
            campaignId,
            commandId: newId<CommandId>(),
            actor: PLAYER,
            starship: asProposed,
            proposalEventId: newId<EventId>(),
          }),
        ).rejects.toMatchObject({ reason: 'unknown_proposal' });

        await expect(
          saveSharedStarship(db.sql, {
            campaignId,
            commandId: newId<CommandId>(),
            actor: PLAYER,
            starship: asProposed,
            groundedIn: [newId<EventId>()],
          }),
        ).rejects.toMatchObject({ reason: 'invalid_grounding' });
      });

      it('records a written ship with its kept field rolls as player-written', async () => {
        const campaignId = await campaign();
        const { quirk1 } = await proposed(campaignId);

        await saveSharedStarship(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          starship: ship(),
          groundedIn: [quirk1!],
        });

        expect(project(await readEvents(db.sql, campaignId)).launch.starship).toMatchObject({
          provenance: 'player_written',
          groundedIn: [quirk1],
        });
      });
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
      const result = await configureLaunchSector(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        sector: { name: 'Lantern Reach', region: 'expanse' },
      });
      return (result.response as { sectorId: EntityId }).sectorId;
    }

    it('mints the sector id, derives its baseline from the region, and keeps both on revision (8.0a)', async () => {
      const campaignId = await campaign();
      const sectorId = await sector(campaignId);

      await configureLaunchSector(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        sector: { name: 'Lantern Reach', region: 'terminus' },
      });

      const events = await readEvents(db.sql, campaignId);
      const configured = events.filter((event) => event.type === 'sector.configured');
      expect(configured.map((event) => event.payload.sectorId)).toEqual([sectorId, sectorId]);
      // The baseline is the region's rule (D-180), written by the server.
      expect(configured.map((event) => event.payload.baseline)).toEqual([
        { settlements: 2, passages: 1 },
        { settlements: 4, passages: 3 },
      ]);
      expect(configured[1]!.payload.supersedesEventId).toBe(configured[0]!.id);
      expect(project(events).launch.sector?.sectorId).toBe(sectorId);
    });

    it('mints a location id, and revises only a location the fold holds (8.0a)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const ember = await addLocation(campaignId, settlement('Ember Hold'));

      const revised = await saveLaunchLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        locationId: ember,
        location: settlement('Ember Hold Station'),
      });
      expect(revised.response).toEqual({ locationId: ember });
      const state = project(await readEvents(db.sql, campaignId));
      expect(Object.keys(state.launch.locations)).toEqual([ember]);
      expect(state.launch.locations[ember]?.name).toBe('Ember Hold Station');

      // An id the server never minted cannot be revised into existence.
      await expect(
        saveLaunchLocation(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          locationId: newId<EntityId>(),
          location: settlement('Invented'),
        }),
      ).rejects.toThrow(expect.objectContaining({ reason: 'unknown_location' }));
    });

    it('refuses a revision that changes what kind of place a location is (8.0a)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const ember = await addLocation(campaignId, settlement('Ember Hold'));

      await expect(
        saveLaunchLocation(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          locationId: ember,
          location: { kind: 'other', name: 'Ember Hold', description: 'Now a ruin' },
        }),
      ).rejects.toThrow(expect.objectContaining({ reason: 'location_kind_changed' }));
    });

    it('refuses a location before a sector exists, and a route to an unknown place', async () => {
      const campaignId = await campaign();

      await expect(addLocation(campaignId, settlement('Ember Hold'))).rejects.toThrow(
        LaunchRejectedError,
      );

      await sector(campaignId);
      const ember = await addLocation(campaignId, settlement('Ember Hold'));

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
      const ember = await addLocation(campaignId, settlement('Ember Hold'));

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
      const ember = await addLocation(campaignId, settlement('Ember Hold'));

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

    it('refuses a passage or a map position for a planet, which is a detail (D-165, 8.0b)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const ember = await addLocation(campaignId, settlement('Ember Hold'));
      const planet = await addLocation(campaignId, {
        kind: 'planet',
        name: 'Ember',
        planetClass: 'furnace',
        details: {},
      });

      await expect(
        saveLaunchRoute(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          route: { from: ember, to: planet },
        }),
      ).rejects.toThrow(expect.objectContaining({ reason: 'not_a_map_node' }));
      await expect(
        setSectorLayout(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          coordinates: { [ember]: { x: 1, y: 1 }, [planet]: { x: 2, y: 2 } },
        }),
      ).rejects.toThrow(expect.objectContaining({ reason: 'not_a_map_node' }));

      // Readiness counts the same endpoints, so it has nothing here to block.
      const events = await readEvents(db.sql, campaignId);
      expect(project(events).launch.routes).toEqual([]);
      const problems = buildLaunchWorkspace(events).readiness.problems;
      expect(problems.map((problem) => problem.code)).not.toContain('route_endpoint_unknown');
    });

    it('links a planet only to a planetside or orbital settlement (8.0b)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const planet = await addLocation(campaignId, {
        kind: 'planet',
        name: 'Ember',
        planetClass: 'furnace',
        details: {},
      });

      await expect(
        addLocation(campaignId, { ...settlement('Ember Hold'), planetId: planet }),
      ).rejects.toThrow(expect.objectContaining({ reason: 'deep_space_planet' }));

      const orbital = await addLocation(campaignId, {
        ...settlement('Ember Hold'),
        location: 'orbital',
        planetId: planet,
      });
      const state = project(await readEvents(db.sql, campaignId));
      expect(state.launch.locations[orbital]).toMatchObject({ planetId: planet });
    });

    it("names the sector's star only when it is an accepted star (D-195, 8.0b)", async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const ember = await addLocation(campaignId, settlement('Ember Hold'));
      const star = await addLocation(campaignId, {
        kind: 'star',
        name: 'Cinder',
        details: { description: 'Smoldering red star' },
      });
      const configure = (starId: EntityId) =>
        configureLaunchSector(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          sector: { name: 'Lantern Reach', region: 'expanse', starId },
        });

      await expect(configure(ember)).rejects.toThrow(
        expect.objectContaining({ reason: 'unknown_star' }),
      );
      await configure(star);

      expect(project(await readEvents(db.sql, campaignId)).launch.sector?.starId).toBe(star);
    });

    it('removes a location with a reason, and its map position with it (8.0g)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const drift = await addLocation(campaignId, {
        kind: 'other',
        name: 'Kessel Drift',
        description: 'A slow river of broken ice',
      });
      await setSectorLayout(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        coordinates: { [drift]: { x: 5, y: 5 } },
      });
      const remove = (reason: string) =>
        removeLaunchLocation(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          locationId: drift,
          reason,
        });

      await expect(remove('  ')).rejects.toMatchObject({ reason: 'removal_reason_required' });
      await remove('It belongs to the next sector over.');

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.launch.locations[drift]).toBeUndefined();
      expect(state.launch.layout[drift]).toBeUndefined();
    });

    it('refuses to remove a location another fact rests on, saying which (8.0g)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const planet = await addLocation(campaignId, {
        kind: 'planet',
        name: 'Hollow',
        planetClass: 'ice',
        details: {},
      });
      const ember = await addLocation(campaignId, {
        ...settlement('Ember Hold'),
        location: 'orbital',
        planetId: planet,
      });
      const still = await addLocation(campaignId, settlement('Still Harbor'));
      await saveLaunchRoute(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        route: { from: ember, to: still },
      });
      await setStartingSettlement(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        settlementId: ember,
      });
      const remove = (locationId: EntityId) =>
        removeLaunchLocation(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          locationId,
          reason: 'Not needed.',
        });

      await expect(remove(planet)).rejects.toThrow(/the planet of Ember Hold/);
      await expect(remove(ember)).rejects.toThrow(/passage.*the starting settlement/);
      await expect(remove(still)).rejects.toMatchObject({ reason: 'location_referenced' });
    });

    it('removes a passage named either way round, and refuses one that is not there (8.0g)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const a = await addLocation(campaignId, settlement('A'));
      const b = await addLocation(campaignId, settlement('B'));
      await saveLaunchRoute(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        route: { from: a, to: b },
      });
      const remove = () =>
        removeLaunchRoute(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          route: { from: b, to: a },
          reason: 'Drawn by mistake.',
        });

      await remove();
      expect(project(await readEvents(db.sql, campaignId)).launch.routes).toEqual([]);
      await expect(remove()).rejects.toMatchObject({ reason: 'unknown_route' });
    });

    it('selects a starting settlement, and refuses one that is not a settlement (A35)', async () => {
      const campaignId = await campaign();
      await sector(campaignId);
      const ember = await addLocation(campaignId, settlement('Ember Hold'));
      const planet = await addLocation(campaignId, {
        kind: 'planet',
        name: 'Ember',
        planetClass: 'furnace',
        details: {},
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
    async function sectorWith(campaignId: CampaignId, count: number): Promise<EntityId[]> {
      await configureLaunchSector(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        sector: { name: 'Lantern Reach', region: 'expanse' },
      });
      const ids: EntityId[] = [];
      for (let index = 0; index < count; index++)
        ids.push(await addLocation(campaignId, settlement(`Settlement ${index}`)));
      return ids;
    }

    it('treats a passage stated the other way round as the same passage', async () => {
      const campaignId = await campaign();
      const [a, b] = (await sectorWith(campaignId, 2)) as [EntityId, EntityId];

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
      const [a] = (await sectorWith(campaignId, 1)) as [EntityId];
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
          sector: { name: 'Too late', region: 'expanse' },
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
        }),
      ).rejects.toThrow(/appearance/i);
    });
  });
});
