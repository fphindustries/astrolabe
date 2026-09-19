import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED, type LaunchRecipeSelector } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  SECTOR_PROPOSAL_TARGET,
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
  proposeLaunchCreation,
  saveLaunchLocation,
  saveLaunchTrouble,
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

  // 8.5, found in the browser: a slot can yield several results, and a row
  // that embeds other tables records them under those tables' ids.
  it('grounds a trouble whose roll embeds Action + Theme in both of its rolls', async () => {
    const campaignId = await campaign();
    const settlementId = await acceptSettlement(campaignId);
    // Every d100 lands on 96: the trouble table's "[Action] + [Theme]" row.
    const rolled = await roll(
      campaignId,
      { kind: 'starting_settlement', firstLookCount: 1 },
      { next: () => 0.955 },
    );
    const events = (await readEvents(db.sql, campaignId)).filter((e) => rolled.includes(e.id));
    // Each result says which slot it fills, whatever table rolled it. At 96
    // the first-look table rolls twice too, the other shape of the same case.
    const slotOf = (e: (typeof events)[number]) =>
      e.type === 'oracle.rolled' ? e.payload.slot : undefined;
    const trouble = events.filter((e) => slotOf(e) === 'trouble').map((e) => e.id);
    expect(trouble).toHaveLength(2);
    expect(events.every((e) => slotOf(e) !== undefined)).toBe(true);

    const result = await proposeTrouble(db.sql, devStub(), {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      kind: 'settlement',
      ownerId: settlementId,
      groundedIn: rolled,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.proposal.text.groundedIn).toEqual(trouble);
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
  // 8.0f — acceptance names the proposal, and the server decides whether it was edited.
  describe('accepting a sector proposal (8.0f)', () => {
    async function proposedSettlement(campaignId: CampaignId) {
      const result = await proposeSettlement(db.sql, devStub(), {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetId: 'draft-deepwater',
        groundedIn: await planetsideRolls(campaignId),
      });
      if (!result.ok) throw new Error('expected a proposal');
      return result;
    }

    it('writes the settlement and its planet in one command, as proposed', async () => {
      const campaignId = await campaign();
      const { proposal, proposalEventId } = await proposedSettlement(campaignId);

      const saved = await saveLaunchLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        location: {
          kind: 'settlement',
          name: proposal.name.value,
          location: proposal.location.value,
          population: proposal.population.value,
          authority: proposal.authority.value,
          projects: proposal.projects.map((project) => project.value),
        },
        planet: {
          details: {
            kind: 'planet',
            name: proposal.planet!.name.value,
            planetClass: proposal.planet!.planetClass.value,
            details: {},
          },
        },
        proposalEventId,
        proposalTargetId: 'draft-deepwater',
      });

      // One decision, one command (D-105): the planet first, then its settlement.
      expect(saved.events.map((event) => event.type)).toEqual(['location.added', 'location.added']);
      expect(saved.events.every((event) => event.causedBy === proposalEventId)).toBe(true);
      const { locationId, planetId } = saved.response as {
        locationId: EntityId;
        planetId: EntityId;
      };
      const state = project(await readEvents(db.sql, campaignId));
      expect(state.launch.locations[locationId]).toMatchObject({
        provenance: 'guide_proposal',
        planetId,
      });
      expect(state.launch.locations[planetId]).toMatchObject({
        kind: 'planet',
        provenance: 'guide_proposal',
        groundedIn: [
          ...proposal.planet!.planetClass.groundedIn,
          ...proposal.planet!.name.groundedIn,
        ],
      });
      // Every settlement field was kept, so every one of its rolls grounds it (A41).
      const settlementRolls = [
        proposal.name,
        proposal.location,
        proposal.population,
        proposal.authority,
        ...proposal.projects,
      ].flatMap((field) => field.groundedIn);
      expect(state.launch.locations[locationId]?.groundedIn).toEqual(settlementRolls);
    });

    it('records an edited field as edited, and drops the roll behind it', async () => {
      const campaignId = await campaign();
      const { proposal, proposalEventId } = await proposedSettlement(campaignId);

      const saved = await saveLaunchLocation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        location: {
          kind: 'settlement',
          name: 'Deepwater Anchorage',
          location: proposal.location.value,
          population: proposal.population.value,
          authority: proposal.authority.value,
          projects: proposal.projects.map((project) => project.value),
        },
        planet: {
          details: {
            kind: 'planet',
            name: proposal.planet!.name.value,
            planetClass: proposal.planet!.planetClass.value,
            details: {},
          },
        },
        proposalEventId,
        proposalTargetId: 'draft-deepwater',
      });

      const { locationId, planetId } = saved.response as {
        locationId: EntityId;
        planetId: EntityId;
      };
      const state = project(await readEvents(db.sql, campaignId));
      const settlement = state.launch.locations[locationId]!;
      expect(settlement.provenance).toBe('guide_proposal_edited');
      expect(settlement.groundedIn).not.toContain(proposal.name.groundedIn[0]);
      // The planet was kept as proposed, so it is judged on its own.
      expect(state.launch.locations[planetId]?.provenance).toBe('guide_proposal');
    });

    it('refuses a proposal named under the wrong key', async () => {
      const campaignId = await campaign();
      const { proposalEventId } = await proposedSettlement(campaignId);

      await expect(
        saveLaunchLocation(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          location: {
            kind: 'settlement',
            name: 'Elsewhere',
            location: 'deep_space',
            population: 'Few',
            authority: 'None',
            projects: ['Waiting'],
          },
          proposalEventId,
          proposalTargetId: 'draft-other',
        }),
      ).rejects.toMatchObject({ reason: 'unknown_proposal' });
    });

    it('accepts a trouble proposal as edited, and revises the same trouble after', async () => {
      const campaignId = await campaign();
      const [trouble] = await roll(campaignId, { kind: 'sector_trouble' });
      const result = await proposeTrouble(db.sql, devStub(), {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        kind: 'sector',
        groundedIn: [trouble!],
      });
      if (!result.ok) throw new Error('expected a proposal');

      const first = await saveLaunchTrouble(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        trouble: { kind: 'sector', text: 'Blockade, as the crew heard it.' },
        proposalEventId: result.proposalEventId,
      });
      const second = await saveLaunchTrouble(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        trouble: { kind: 'sector', text: 'Blockade, worse than rumoured.' },
      });

      // The owner names the trouble, so the second write revises the first (8.0f).
      expect(second.response).toEqual(first.response);
      expect(second.events[0]?.type).toBe('trouble.revised');
      const troubles = Object.values(project(await readEvents(db.sql, campaignId)).launch.troubles);
      expect(troubles).toHaveLength(1);
      expect(first.events[0]).toMatchObject({
        causedBy: result.proposalEventId,
        payload: { provenance: 'guide_proposal_edited', groundedIn: [] },
      });
    });

    it('accepts the sector name the Guide proposed, with its rolls', async () => {
      const campaignId = await campaign();
      const rolls = await roll(campaignId, { kind: 'sector_name' });
      await proposeLaunchCreation(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        proposal: {
          targetKind: 'sector',
          proposal: { name: { value: 'Ashen Anvil', reason: 'The two rolls.', groundedIn: rolls } },
        },
        targetId: SECTOR_PROPOSAL_TARGET,
        rationale: 'A name for the reach.',
        groundedIn: rolls,
      });
      const proposalEventId = project(await readEvents(db.sql, campaignId)).launch.proposals[
        SECTOR_PROPOSAL_TARGET
      ]!.eventId;

      await configureLaunchSector(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        sector: { name: 'Ashen Anvil', region: 'outlands' },
        proposalEventId,
      });

      expect(project(await readEvents(db.sql, campaignId)).launch.sector).toMatchObject({
        name: 'Ashen Anvil',
        provenance: 'guide_proposal',
        groundedIn: rolls,
      });
    });

    it('refuses field rolls that are not recorded oracle rolls (A41)', async () => {
      const campaignId = await campaign();

      await expect(
        saveLaunchTrouble(db.sql, {
          campaignId,
          commandId: newId<CommandId>(),
          actor: PLAYER,
          trouble: { kind: 'sector', text: 'Written.' },
          groundedIn: [newId<EventId>()],
        }),
      ).rejects.toMatchObject({ reason: 'invalid_grounding' });
    });
  });
});
