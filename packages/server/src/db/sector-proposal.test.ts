import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED, type LaunchRecipeSelector } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EntityId,
  type EventId,
} from '@astrolabe/shared';

import { createProviderFromEnv } from '../ai/create-provider.js';
import { StubProvider } from '../ai/stub.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { readEvents } from './event-store.js';
import {
  configureLaunchSector,
  decideTruth,
  rollLaunchRecipe,
  saveLaunchDraft,
  saveLaunchLocation,
  setStartingSettlement,
} from './launch-commands.js';
import { AiRequestRefusedError } from './narration-commands.js';
import { proposeSettlement, proposeTrouble } from './proposal-commands.js';
import { beginSession } from './session-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

/**
 * Task 8.0e: the Guide proposes a settlement or interprets a trouble from
 * declared recipe rolls (D-166, D-196).
 *
 * The properties under test are the ones D-166 names — the server rolls
 * before the Guide interprets, the proposal cites those rolls field by field,
 * and nothing is canon until accepted (D-161) — plus the one §4 adds for a
 * sector: where a roll *is* the answer, the Guide may not replace it. The dev
 * stub is used where it can be, because it is the stubbed launch's own path.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const devStub = () => createProviderFromEnv({ ASTROLABE_AI_PROVIDER: 'stub' });
/** Every d100 lands on 31: Planetside, and a grave world. */
const PLANETSIDE = { next: () => 0.305 };
/** Every d100 lands on 91: Deep Space, and a shattered world. */
const DEEP_SPACE = { next: () => 0.905 };

describe.skipIf(!hasTestDatabase)('proposing a settlement or a trouble (8.0e)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('sector_proposals');
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
    await configureLaunchSector(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      sector: { name: 'Lantern Reach', region: 'outlands' },
    });
    return campaignId;
  }

  async function roll(
    campaignId: CampaignId,
    selector: LaunchRecipeSelector,
    rng = PLANETSIDE,
  ): Promise<EventId[]> {
    const rolled = await rollLaunchRecipe(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      selector,
      rng,
    });
    return rolled.events.map((event) => event.id);
  }

  /** A settlement with a planet: the settlement recipe, a class, then that class's shallow recipe. */
  async function planetsideRolls(campaignId: CampaignId): Promise<EventId[]> {
    return [
      ...(await roll(campaignId, { kind: 'settlement', region: 'outlands', projectCount: 2 })),
      ...(await roll(campaignId, { kind: 'planet_class' })),
      ...(await roll(campaignId, { kind: 'planet', planetClass: 'grave', depth: 'shallow' })),
    ];
  }

  async function acceptSettlement(campaignId: CampaignId): Promise<EntityId> {
    const result = await saveLaunchLocation(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      location: {
        kind: 'settlement',
        name: 'Deepwater Anchorage',
        location: 'deep_space',
        population: 'Thousands',
        authority: 'Corporate',
        projects: ['Ice mining'],
      },
    });
    return (result.response as { locationId: EntityId }).locationId;
  }

  it('grounds each field, and the planet, in its own roll, and is not canon', async () => {
    const campaignId = await campaign();
    const groundedIn = await planetsideRolls(campaignId);

    const result = await proposeSettlement(db.sql, devStub(), {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      targetId: 'draft-deepwater',
      groundedIn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byOracle = new Map(result.rolls.map((r) => [r.oracleId, r.eventId]));
    expect(result.proposal.name.groundedIn).toEqual([byOracle.get('oracle:settlements/name')]);
    // The location and class are the rolled ones, never the Guide's (§4).
    expect(result.proposal.location.value).toBe('planetside');
    expect(result.proposal.planet?.planetClass.value).toBe('grave');
    expect(result.proposal.planet?.name.groundedIn).toEqual([
      byOracle.get('oracle:planets/grave/name'),
    ]);
    expect(result.proposal.projects).toHaveLength(2);
    expect(result.proposal.firstLooks).toBeUndefined();
    // The recipe rolls were their own commands: this one rolled nothing (D-186).
    expect(result.rolls.map((r) => r.eventId).sort()).toEqual([...groundedIn].sort());

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.launch.locations).toEqual({});
    expect(state.launch.proposals['draft-deepwater']).toMatchObject({
      targetKind: 'settlement',
      eventId: result.proposalEventId,
    });
  });

  it('refuses before asking the Guide when a slot has no roll', async () => {
    const campaignId = await campaign();
    const [name] = await roll(campaignId, {
      kind: 'settlement',
      region: 'outlands',
      projectCount: 1,
    });
    const ai = new StubProvider();

    await expect(
      proposeSettlement(db.sql, ai, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetId: 'draft-x',
        groundedIn: [name!],
      }),
    ).rejects.toMatchObject({ reason: 'no_rolls' });
    expect(ai.requests).toHaveLength(0);
  });

  it('refuses a planet for a settlement the dice put in deep space', async () => {
    const campaignId = await campaign();
    const groundedIn = [
      ...(await roll(
        campaignId,
        { kind: 'settlement', region: 'outlands', projectCount: 1 },
        DEEP_SPACE,
      )),
      ...(await roll(campaignId, { kind: 'planet_class' }, DEEP_SPACE)),
      ...(await roll(campaignId, { kind: 'planet', planetClass: 'shattered', depth: 'shallow' })),
    ];

    await expect(
      proposeSettlement(db.sql, devStub(), {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetId: 'draft-x',
        groundedIn,
      }),
    ).rejects.toMatchObject({ reason: 'deep_space_planet' });
  });

  it('offers first looks only for the starting settlement (beat 9)', async () => {
    const campaignId = await campaign();
    const settlementId = await acceptSettlement(campaignId);
    const groundedIn = [
      ...(await roll(
        campaignId,
        { kind: 'settlement', region: 'outlands', projectCount: 1 },
        DEEP_SPACE,
      )),
      ...(await roll(campaignId, { kind: 'starting_settlement', firstLookCount: 2 })),
    ];
    const propose = () =>
      proposeSettlement(db.sql, devStub(), {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetId: settlementId,
        groundedIn,
      });

    await expect(propose()).rejects.toMatchObject({ reason: 'not_starting_settlement' });

    await setStartingSettlement(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      settlementId,
    });
    const result = await propose();
    expect(result.ok && result.proposal.firstLooks).toHaveLength(2);
  });

  it('interprets a sector trouble against the accepted truths, and not a draft (D-161)', async () => {
    const campaignId = await campaign();
    await decideTruth(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: STARFORGED.truths[1]!.id,
      resolution: 'custom',
      text: 'ACCEPTED-TRUTH-MARKER',
    });
    await saveLaunchDraft(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: { section: 'sector', snapshot: { name: 'DRAFT-ONLY-MARKER' } },
    });
    const ai = devStub() as StubProvider;
    const [trouble] = await roll(campaignId, { kind: 'sector_trouble' });

    const result = await proposeTrouble(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      kind: 'sector',
      groundedIn: [trouble!],
    });

    expect(result.ok && result.targetId).toBe('trouble:sector');
    expect(result.ok && result.proposal.text.groundedIn).toEqual([trouble]);
    const user = ai.requests[0]?.user ?? '';
    // The positive control: without it, an empty context would pass too.
    expect(user).toContain('ACCEPTED-TRUTH-MARKER');
    expect(user).not.toContain('DRAFT-ONLY-MARKER');
    expect(project(await readEvents(db.sql, campaignId)).launch.troubles).toEqual({});
  });

  it('interprets a settlement trouble only for an accepted settlement, under its own key', async () => {
    const campaignId = await campaign();
    const rolled = await roll(campaignId, { kind: 'starting_settlement', firstLookCount: 1 });
    const trouble = rolled.at(-1)!;
    const propose = (ownerId: EntityId) =>
      proposeTrouble(db.sql, devStub(), {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        kind: 'settlement',
        ownerId,
        groundedIn: [trouble],
      });

    await expect(propose(newId<EntityId>())).rejects.toMatchObject({ reason: 'invalid_target' });

    const settlementId = await acceptSettlement(campaignId);
    const result = await propose(settlementId);
    expect(result.ok && result.targetId).toBe(`trouble:${settlementId}`);
    expect(result.ok && result.proposal).toMatchObject({
      kind: 'settlement',
      ownerId: settlementId,
    });
  });

  it('is refused for a campaign already in play (D-178)', async () => {
    const campaignId = await campaign();
    const groundedIn = await planetsideRolls(campaignId);
    await beginSession(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      scene: { title: 'The dock' },
    });

    await expect(
      proposeSettlement(db.sql, devStub(), {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetId: 'draft-x',
        groundedIn,
      }),
    ).rejects.toBeInstanceOf(AiRequestRefusedError);
  });
});
