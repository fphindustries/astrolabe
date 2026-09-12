import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED, type AssetId, type CharacterDraft } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { project } from '../projection/project.js';

import { CharacterRejectedError, createCharacter } from './character-commands.js';
import { appendCommand, readEvents } from './event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const REAL_ASSETS = STARFORGED.assets.slice(0, 2).map((a) => a.id);

function draft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    name: 'Vesna Kade',
    callsign: 'Vesna',
    stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
    assets: REAL_ASSETS,
    ...overrides,
  };
}

describe.skipIf(!hasTestDatabase)('creating a character (task 3.5)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('chars');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  async function newCampaign(): Promise<CampaignId> {
    const campaignId = newId<CampaignId>();
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'campaign.create',
      actor: PLAYER,
      createCampaign: { name: 'Lantern Wake' },
      events: [
        {
          type: 'campaign.created',
          payload: {
            name: 'Lantern Wake',
            settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
          },
        },
      ],
    });
    return campaignId;
  }

  it('writes a character with the starting values from the rules', async () => {
    const campaignId = await newCampaign();
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft(),
    });

    const character = project(await readEvents(db.sql, campaignId)).characters[characterId];
    expect(character?.name).toBe('Vesna Kade');
    expect(character?.stats).toEqual({ edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 });
    expect(character?.momentum.value).toBe(2);
    expect(character?.momentum.max).toBe(10);
    expect(character?.meters.health).toMatchObject({ value: 5, min: 0, max: 5 });
    expect(character?.markedImpacts).toBe(0);
    expect(character?.assets).toEqual(REAL_ASSETS);
  });

  it('trims the name and callsign it stores', async () => {
    const campaignId = await newCampaign();
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft({ name: '  Rook Ilari  ', callsign: ' Rook ' }),
    });

    const character = project(await readEvents(db.sql, campaignId)).characters[characterId];
    expect(character?.name).toBe('Rook Ilari');
    expect(character?.callsign).toBe('Rook');
  });

  it('writes the background vow in the same command, owned by the character', async () => {
    const campaignId = await newCampaign();
    const { characterId, vowTrackId, result } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft(),
      backgroundVow: { title: 'Find the ship that left me behind', rank: 'formidable' },
    });

    // One command, so a character never exists without the vow they were
    // conceived around.
    expect(result.events).toHaveLength(2);
    expect(new Set(result.events.map((e) => e.commandId)).size).toBe(1);

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.tracks[vowTrackId as never]?.title).toBe('Find the ship that left me behind');
    expect(state.tracks[vowTrackId as never]?.maxTicks).toBe(40);
    // The sheet can list the vow without scanning every track.
    expect(state.characters[characterId]?.vowTrackIds).toEqual([vowTrackId]);
  });

  it('creates a character without a vow when none is given', async () => {
    const campaignId = await newCampaign();
    const { characterId, vowTrackId, result } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft(),
    });

    expect(vowTrackId).toBeUndefined();
    expect(result.events).toHaveLength(1);
    expect(
      project(await readEvents(db.sql, campaignId)).characters[characterId]?.vowTrackIds,
    ).toEqual([]);
  });

  it('rejects an invalid draft and writes nothing', async () => {
    const campaignId = await newCampaign();
    const before = await readEvents(db.sql, campaignId);

    await expect(
      createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft({ stats: { edge: 5, heart: 5, iron: 5, shadow: 5, wits: 5 } }),
      }),
    ).rejects.toThrow(CharacterRejectedError);

    expect(await readEvents(db.sql, campaignId)).toHaveLength(before.length);
  });

  it('carries every problem on the error, for a form to show in place', async () => {
    const campaignId = await newCampaign();
    try {
      await createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft({ name: '', assets: ['asset:path/nope' as AssetId] }),
      });
      throw new Error('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(CharacterRejectedError);
      const problems = (error as CharacterRejectedError).problems;
      expect(problems.map((p) => p.code).sort()).toEqual(['name_required', 'unknown_asset']);
    }
  });

  it('validates on the server even though the client validates too', async () => {
    // The client validates so a player sees a problem as they type; the
    // server validates because it is authoritative and a client is not to
    // be trusted about what the rules say.
    const campaignId = await newCampaign();
    await expect(
      createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft({ assets: [REAL_ASSETS[0] as AssetId, REAL_ASSETS[0] as AssetId] }),
      }),
    ).rejects.toThrow(/selected twice/);
  });

  it('is idempotent on a retry', async () => {
    const campaignId = await newCampaign();
    const commandId = newId<CommandId>();
    const request = { campaignId, commandId, actor: PLAYER, draft: draft() };

    const first = await createCharacter(db.sql, request);
    const retry = await createCharacter(db.sql, request);

    expect(first.result.replayed).toBe(false);
    expect(retry.result.replayed).toBe(true);
    expect(Object.keys(project(await readEvents(db.sql, campaignId)).characters)).toHaveLength(1);
  });

  it('lets three characters share one campaign, as the golden session does', async () => {
    const campaignId = await newCampaign();
    for (const [name, callsign] of [
      ['Vesna Kade', 'Vesna'],
      ['Rook Ilari', 'Rook'],
      ['Juno Marr', 'Juno'],
    ]) {
      await createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft({ name: name as string, callsign: callsign as string }),
      });
    }

    const characters = Object.values(project(await readEvents(db.sql, campaignId)).characters);
    expect(characters.map((c) => c.callsign).sort()).toEqual(['Juno', 'Rook', 'Vesna']);
  });
});
