import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  installedModules,
  STARFORGED,
  type AssetId,
  type ChallengeRank,
  type CharacterDraft,
  type CharacterId,
  type OracleId,
} from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EventId,
} from '@astrolabe/shared';

import { buildLaunchWorkspace } from '../launch/workspace.js';
import { project } from '../projection/project.js';

import {
  CharacterRejectedError,
  LaunchCharacterRejectedError,
  UnknownCharacterError,
  createCharacter,
  removeCharacter,
  reviseCharacter,
  type ReviseCharacterRequest,
} from './character-commands.js';
import { rollLaunchOracle } from './launch-commands.js';
import { appendCommand, readEvents } from './event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const byCategory = (category: string, n: number) =>
  STARFORGED.assets
    .filter((a) => a.categoryId === category)
    .slice(0, n)
    .map((a) => a.id);

/** A legal set under D-89: two paths plus a companion in the final slot. */
const REAL_ASSETS = [...byCategory('path', 2), ...byCategory('companion', 1)];
const STARSHIP = byCategory('command_vehicle', 1)[0] as AssetId;

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
    // The three chosen slots, plus the granted starship (D-89).
    expect(character?.assets).toEqual([...REAL_ASSETS, STARSHIP]);
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

  it('refuses a rank outside the vocabulary, now that nothing casts it away (6.0g, D-175)', async () => {
    // The cast this replaces made `rank` a `string` all the way to the event,
    // so the compiler had nothing to check and only the append-time schema
    // stood between a typo and a written track. The request type is now
    // `ChallengeRank`, which is the real fix; this asserts the second line of
    // defence still holds for a caller that reaches the command untyped, which
    // is what the cast made every caller look like.
    const campaignId = await newCampaign();

    await expect(
      createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft(),
        backgroundVow: { title: 'Find the ship', rank: 'legendary' as ChallengeRank },
      }),
    ).rejects.toThrow();

    expect(Object.keys(project(await readEvents(db.sql, campaignId)).characters)).toEqual([]);
  });

  it('cites the rolls the player built the character from (6.2, A41)', async () => {
    // Beat 5: Juno is built by hand, with a rolled backstory prompt for
    // inspiration. The prompt is not the backstory — the player writes that —
    // but the roll is what the accepted fact was built on, so it has to be
    // citable or A41's chip has nothing to resolve.
    const campaignId = await newCampaign();
    const rolled = await rollLaunchOracle(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      oracleId: 'oracle:campaign-launch/backstory-prompts' as OracleId,
    });
    const rollEventId = (rolled.response as { eventId: EventId }).eventId;

    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft(),
      backgroundVow: { title: 'Find the lost survey', rank: 'formidable' },
      launch: {
        appearance: 'Sharp-eyed.',
        backstory: { kind: 'written', text: 'Flew charts nobody else trusted.' },
      },
      grantCommandVehicle: false,
      groundedIn: [rollEventId],
    });

    const events = await readEvents(db.sql, campaignId);
    const character = project(events).characters[characterId];
    // The player wrote the words; the roll is what they drew on.
    expect(character?.provenance).toBe('player_written');
    expect(character?.groundedIn).toEqual([rollEventId]);
    // And 6.0b's resolver turns that into the chip the player reads.
    expect(buildLaunchWorkspace(events).chips[rollEventId]).toMatchObject({
      oracleId: 'oracle:campaign-launch/backstory-prompts',
    });
  });

  it('leaves a Milestone 1 character with no provenance at all', async () => {
    // The launch path records it; the legacy creation path is untouched, so a
    // character created without launch fields still carries neither field.
    const campaignId = await newCampaign();
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft(),
    });

    const character = project(await readEvents(db.sql, campaignId)).characters[characterId];
    expect(Object.hasOwn(character!, 'provenance')).toBe(false);
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

  describe('the starship grant (D-89)', () => {
    it('grants the command vehicle without it occupying a slot', async () => {
      const campaignId = await newCampaign();
      const { characterId } = await createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft(),
      });

      const assets = project(await readEvents(db.sql, campaignId)).characters[characterId]?.assets;
      expect(assets).toContain(STARSHIP);
      // The three chosen, plus the granted starship.
      expect(assets).toHaveLength(4);
    });

    it('does not duplicate a starship the client sent back with the sheet', async () => {
      const campaignId = await newCampaign();
      const { characterId } = await createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft({ assets: [...REAL_ASSETS, STARSHIP] }),
      });

      const assets = project(await readEvents(db.sql, campaignId)).characters[characterId]?.assets;
      expect(assets?.filter((a) => a === STARSHIP)).toHaveLength(1);
    });

    it('can be declined, since ownership is narrative', async () => {
      const campaignId = await newCampaign();
      const { characterId } = await createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft(),
        grantCommandVehicle: false,
      });

      const assets = project(await readEvents(db.sql, campaignId)).characters[characterId]?.assets;
      expect(assets).not.toContain(STARSHIP);
      expect(assets).toHaveLength(3);
    });

    it('rejects a deed in a slot (D-89)', async () => {
      const campaignId = await newCampaign();
      await expect(
        createCharacter(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          draft: draft({ assets: [...byCategory('path', 2), ...byCategory('deed', 1)] }),
        }),
      ).rejects.toThrow(/cannot be chosen at creation/);
    });
  });
});

describe.skipIf(!hasTestDatabase)('revising and removing a crew member (6.0d)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('crew_revise');
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

  const LAUNCH = {
    appearance: 'Sharp-eyed, jacket a size too big.',
    backstory: { kind: 'written' as const, text: 'Flew charts nobody else trusted.' },
  };
  const VOW = { title: 'Find the lost survey', rank: 'formidable' as const };

  /** A campaign with one complete launch character and its background vow. */
  async function withCrew(): Promise<{ campaignId: CampaignId; characterId: CharacterId }> {
    const campaignId = await newCampaign();
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft(),
      backgroundVow: VOW,
      launch: LAUNCH,
      grantCommandVehicle: false,
    });
    return { campaignId, characterId };
  }

  const revise = (
    campaignId: CampaignId,
    characterId: CharacterId,
    overrides: Partial<ReviseCharacterRequest> = {},
  ) =>
    reviseCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      characterId,
      draft: draft(),
      backgroundVow: VOW,
      launch: LAUNCH,
      ...overrides,
    });

  it('supersedes the earlier version and keeps it readable', async () => {
    const { campaignId, characterId } = await withCrew();
    const before = project(await readEvents(db.sql, campaignId)).characters[characterId];

    await revise(campaignId, characterId, {
      launch: { ...LAUNCH, appearance: 'A quieter jacket.' },
    });

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.characters[characterId]?.appearance).toBe('A quieter jacket.');
    // The server names what it supersedes, from its own projection.
    const revision = (await readEvents(db.sql, campaignId)).find(
      (event) => event.type === 'character.revised',
    );
    expect(revision?.type === 'character.revised' && revision.payload.supersedesEventId).toBe(
      before?.eventId,
    );
    expect(state.launch.crewHistory[characterId]?.[0]?.appearance).toBe(LAUNCH.appearance);
  });

  it('carries the meters and momentum through rather than resetting them', async () => {
    const { campaignId, characterId } = await withCrew();

    await revise(campaignId, characterId, { draft: draft({ name: 'Vesna K. Kade' }) });

    const character = project(await readEvents(db.sql, campaignId)).characters[characterId];
    expect(character?.name).toBe('Vesna K. Kade');
    expect(character?.meters.health).toMatchObject({ value: 5, min: 0, max: 5 });
    expect(character?.momentum.value).toBe(2);
  });

  it('moves the background vow’s own track with it (D-188)', async () => {
    const { campaignId, characterId } = await withCrew();
    const track = project(await readEvents(db.sql, campaignId)).characters[characterId]
      ?.vowTrackIds[0];
    expect(track).toBeDefined();

    await revise(campaignId, characterId, {
      backgroundVow: { title: 'Find the lost survey, and who buried it', rank: 'extreme' },
    });

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.tracks[track!]?.title).toBe('Find the lost survey, and who buried it');
    expect(state.tracks[track!]?.rank).toBe('extreme');
    // Still one track: a rename, not a second vow.
    expect(state.characters[characterId]?.vowTrackIds).toEqual([track]);
  });

  it('writes no track event when the vow did not change', async () => {
    const { campaignId, characterId } = await withCrew();

    await revise(campaignId, characterId, {
      launch: { ...LAUNCH, appearance: 'Only the jacket changed.' },
    });

    const events = await readEvents(db.sql, campaignId);
    expect(events.filter((event) => event.type === 'track.revised')).toHaveLength(0);
  });

  it('gives a character who had no vow track the one they were missing', async () => {
    // A Milestone 1 character created without a background vow: the revision
    // adds one, so it needs `track.created`, not `track.revised`.
    const campaignId = await newCampaign();
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft(),
      grantCommandVehicle: false,
    });

    const { vowTrackId } = await revise(campaignId, characterId);

    expect(vowTrackId).toBeDefined();
    const state = project(await readEvents(db.sql, campaignId));
    expect(state.tracks[vowTrackId!]?.title).toBe(VOW.title);
    expect(state.characters[characterId]?.vowTrackIds).toEqual([vowTrackId]);
  });

  it('refuses a revision the launch rules reject', async () => {
    const { campaignId, characterId } = await withCrew();

    await expect(
      revise(campaignId, characterId, { launch: { ...LAUNCH, appearance: '   ' } }),
    ).rejects.toBeInstanceOf(LaunchCharacterRejectedError);
  });

  it('refuses a character the campaign does not have', async () => {
    const campaignId = await newCampaign();

    await expect(revise(campaignId, newId<CharacterId>())).rejects.toBeInstanceOf(
      UnknownCharacterError,
    );
    await expect(
      removeCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        characterId: newId<CharacterId>(),
        reason: 'Never existed.',
      }),
    ).rejects.toBeInstanceOf(UnknownCharacterError);
  });

  it('removes a crew member and their vow track together', async () => {
    const { campaignId, characterId } = await withCrew();
    const track = project(await readEvents(db.sql, campaignId)).characters[characterId]
      ?.vowTrackIds[0];

    await removeCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      characterId,
      reason: 'Replaced by a different concept.',
    });

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.characters[characterId]).toBeUndefined();
    expect(state.tracks[track!]).toBeUndefined();
    // A40: what was removed stays answerable.
    expect(state.launch.crewHistory[characterId]).toHaveLength(1);
  });

  it('lets the crew reach zero, because readiness is what refuses a launch', async () => {
    // Not a command's job to enforce a crew floor (D-176): a player who removes
    // their only character to build a better one passes through zero.
    const { campaignId, characterId } = await withCrew();

    await removeCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      characterId,
      reason: 'Starting over.',
    });

    const events = await readEvents(db.sql, campaignId);
    expect(Object.keys(project(events).characters)).toEqual([]);
    expect(
      buildLaunchWorkspace(events).readiness.sections.crew.blockers.map((b) => b.code),
    ).toContain('crew_count_invalid');
  });

  // D-191: the ship's modules are the crew's, so changing the crew changes the
  // ship with no second write, and nothing can be left naming a missing owner.
  it('installs a held module on the ship, and revising or removing its holder takes it off', async () => {
    const moduleId = byCategory('module', 1)[0] as AssetId;
    const withModule = [...byCategory('path', 2), moduleId];
    const campaignId = await newCampaign();
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: draft({ assets: withModule }),
      backgroundVow: VOW,
      launch: LAUNCH,
      grantCommandVehicle: false,
    });
    const installed = async () =>
      installedModules(
        Object.values(project(await readEvents(db.sql, campaignId)).characters),
        STARFORGED,
      );
    expect(await installed()).toEqual([{ assetId: moduleId, ownerCharacterId: characterId }]);

    await revise(campaignId, characterId, { draft: draft() });
    expect(await installed()).toEqual([]);

    await revise(campaignId, characterId, { draft: draft({ assets: withModule }) });
    await removeCharacter(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      characterId,
      reason: 'Replaced.',
    });
    expect(await installed()).toEqual([]);
    const blockers = buildLaunchWorkspace(await readEvents(db.sql, campaignId)).readiness.sections
      .starship.blockers;
    expect(blockers.map((blocker) => blocker.code)).not.toContain('module_owner_unknown');
  });

  it('reports a module two crew members hold as a Crew blocker on the later one', async () => {
    const moduleId = byCategory('module', 1)[0] as AssetId;
    const withModule = [...byCategory('path', 2), moduleId];
    const campaignId = await newCampaign();
    for (const name of ['Vesna Kade', 'Juno Marr'])
      await createCharacter(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        draft: draft({ name, callsign: name.split(' ')[0]!, assets: withModule }),
        backgroundVow: VOW,
        launch: LAUNCH,
        grantCommandVehicle: false,
      });
    const events = await readEvents(db.sql, campaignId);
    const juno = Object.values(project(events).characters).find((c) => c.name === 'Juno Marr')!;

    const crew = buildLaunchWorkspace(events).readiness.sections.crew.blockers;
    expect(crew.filter((blocker) => blocker.code === 'module_duplicate')).toEqual([
      expect.objectContaining({ path: `characters.${juno.id}.assets` }),
    ]);
  });
});
