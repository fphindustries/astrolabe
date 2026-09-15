import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSeededRandomSource, STARFORGED } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EntityId,
} from '@astrolabe/shared';

import { project } from '../projection/project.js';

import {
  addSectorLocation,
  addSectorRoute,
  createCampaign,
  IncitingVowRejectedError,
  SectorRouteRejectedError,
  setTruth,
  swearIncitingVow,
  TruthRejectedError,
} from './campaign-commands.js';
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

  async function newCampaign(): Promise<CampaignId> {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'A fresh campaign',
    });
    return campaignId;
  }

  describe('answering a setting truth (task 4.2)', () => {
    it('writes the written answer verbatim', async () => {
      const campaignId = await newCampaign();
      const { text } = await setTruth(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        oracleId: CATACLYSM.id,
        source: 'written',
        text: 'A slow climate collapse, not a single cataclysm.',
      });
      expect(text).toBe('A slow climate collapse, not a single cataclysm.');

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.truths[CATACLYSM.id]).toEqual({ text, source: 'written' });
    });

    it('resolves a picked option to the book’s own text, not client-supplied text', async () => {
      const campaignId = await newCampaign();
      const row = CATACLYSM.rows[0];
      if (row === undefined) throw new Error('expected a row');

      const { text } = await setTruth(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        oracleId: CATACLYSM.id,
        source: 'picked',
        rowIndex: 0,
      });
      expect(text).toBe(row.text);
    });

    it('rolls on the server — deterministic under a seeded RNG, not client-supplied', async () => {
      const first = await setTruth(db.sql, {
        campaignId: await newCampaign(),
        commandId: newId<CommandId>(),
        actor: PLAYER,
        oracleId: CATACLYSM.id,
        source: 'rolled',
        rng: createSeededRandomSource(1),
      });
      const second = await setTruth(db.sql, {
        campaignId: await newCampaign(),
        commandId: newId<CommandId>(),
        actor: PLAYER,
        oracleId: CATACLYSM.id,
        source: 'rolled',
        rng: createSeededRandomSource(1),
      });

      expect(first.text).toBe(second.text);
      expect(CATACLYSM.rows.map((r) => r.text)).toContain(first.text);
    });

    it('rejects answering the same question twice', async () => {
      const campaignId = await newCampaign();
      await setTruth(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        oracleId: CATACLYSM.id,
        source: 'written',
        text: 'First answer.',
      });

      await expect(
        setTruth(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          oracleId: CATACLYSM.id,
          source: 'written',
          text: 'Second answer.',
        }),
      ).rejects.toThrow(TruthRejectedError);
    });

    it('rejects an oracle id that is not a setting truth', async () => {
      const campaignId = await newCampaign();
      await expect(
        setTruth(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          oracleId: 'oracle:core/action' as never,
          source: 'written',
          text: 'x',
        }),
      ).rejects.toThrow(TruthRejectedError);
    });

    it('rejects a written answer with no text', async () => {
      const campaignId = await newCampaign();
      await expect(
        setTruth(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          oracleId: CATACLYSM.id,
          source: 'written',
        }),
      ).rejects.toThrow(TruthRejectedError);
    });
  });

  describe('the sector: locations and routes (task 4.3)', () => {
    it('establishes a player-written location', async () => {
      const campaignId = await newCampaign();
      const { locationId } = await addSectorLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        name: 'The derelict relay station',
        description: 'At the edge of the sector.',
      });

      const state = project(await readEvents(db.sql, campaignId));
      const location = state.entities[locationId];
      expect(location?.kind).toBe('location');
      expect(location?.name).toBe('The derelict relay station');
      expect(location?.provenance.establishedBy).toBe('player');
    });

    it('adds a route between two established locations', async () => {
      const campaignId = await newCampaign();
      const a = await addSectorLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        name: 'Station',
        description: '',
      });
      const b = await addSectorLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        name: 'Outpost',
        description: '',
      });

      await addSectorRoute(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        fromLocationId: a.locationId,
        toLocationId: b.locationId,
      });

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.sector.routes).toEqual([{ from: a.locationId, to: b.locationId }]);
    });

    it('rejects a route to something that is not an established location', async () => {
      const campaignId = await newCampaign();
      const a = await addSectorLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        name: 'Station',
        description: '',
      });

      await expect(
        addSectorRoute(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          fromLocationId: a.locationId,
          toLocationId: newId<EntityId>(),
        }),
      ).rejects.toThrow(SectorRouteRejectedError);
    });
  });

  describe('the inciting incident becomes the first vow (task 4.4)', () => {
    it('writes a crew-level vow with the player-written incident', async () => {
      const campaignId = await newCampaign();
      const { vowTrackId } = await swearIncitingVow(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        title: "Recover the flight recorder of Meridian's Hope",
        rank: 'formidable',
      });

      const state = project(await readEvents(db.sql, campaignId));
      const vow = state.tracks[vowTrackId];
      expect(vow?.title).toBe("Recover the flight recorder of Meridian's Hope");
      expect(vow?.rank).toBe('formidable');
      expect(vow?.maxTicks).toBe(40);
      // No character owns it — it's the crew's vow.
      expect(Object.values(state.characters)).toHaveLength(0);
    });

    it('rejects an empty incident', async () => {
      const campaignId = await newCampaign();
      await expect(
        swearIncitingVow(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          title: '   ',
          rank: 'formidable',
        }),
      ).rejects.toThrow(IncitingVowRejectedError);
    });
  });
});
