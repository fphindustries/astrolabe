import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  STARSHIP_PROPOSAL_TARGET,
  type Actor,
  type CampaignId,
  type CommandId,
  type EventId,
} from '@astrolabe/shared';

import { createProviderFromEnv } from '../ai/create-provider.js';
import { StubProvider } from '../ai/stub.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { readEvents } from './event-store.js';
import {
  decideTruth,
  rollLaunchRecipe,
  saveLaunchDraft,
  saveSharedStarship,
} from './launch-commands.js';
import { AiRequestRefusedError } from './narration-commands.js';
import { proposeStarship } from './proposal-commands.js';
import { beginSession } from './session-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

/**
 * Task 7.0e: the Guide proposes the crew's ship from a declared recipe roll.
 *
 * The properties under test are the ones D-166 names: the server rolls before
 * the Guide interprets, the proposal cites those rolls field by field, and it
 * is not canon until `saveSharedStarship` accepts it (D-161). The dev stub is
 * used where it can be, because it is the stubbed launch's own path (A42).
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const devStub = () => createProviderFromEnv({ ASTROLABE_AI_PROVIDER: 'stub' });

describe.skipIf(!hasTestDatabase)('proposing the shared starship (7.0e)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('starship_proposals');
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

  async function roll(campaignId: CampaignId, quirkCount: 1 | 2): Promise<EventId[]> {
    const rolled = await rollLaunchRecipe(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      selector: { kind: 'starship', quirkCount },
      rng: { next: () => 0.3 },
    });
    return rolled.events.map((event) => event.id);
  }

  it('grounds each field in its own roll, and is not the ship until accepted', async () => {
    const campaignId = await campaign();
    const [name, history, quirk1, quirk2] = await roll(campaignId, 2);

    const result = await proposeStarship(db.sql, devStub(), {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      groundedIn: [name!, history!, quirk1!, quirk2!],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.name.groundedIn).toEqual([name]);
    expect(result.proposal.history.groundedIn).toEqual([history]);
    expect(result.proposal.quirks.map((quirk) => quirk.groundedIn)).toEqual([[quirk1], [quirk2]]);
    // The recipe roll was its own command: this one rolled nothing (D-186).
    expect(result.rolls.map((r) => r.eventId)).toEqual([name, history, quirk1, quirk2]);
    const events = await readEvents(db.sql, campaignId);
    expect(events.filter((event) => event.type === 'oracle.rolled')).toHaveLength(4);

    const state = project(events);
    // Proposed, not established: the D-161 boundary in one assertion.
    expect(state.launch.starship).toBeUndefined();
    expect(state.launch.proposals[STARSHIP_PROPOSAL_TARGET]).toMatchObject({
      targetKind: 'starship',
      eventId: result.proposalEventId,
    });

    // And the stubbed launch reaches an acceptance through the ordinary command.
    await saveSharedStarship(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      starship: {
        name: result.proposal.name.value,
        appearance: result.proposal.appearance.value,
        history: result.proposal.history.value,
        quirks: result.proposal.quirks.map((quirk) => quirk.value),
      },
      proposalEventId: result.proposalEventId,
    });
    expect(project(await readEvents(db.sql, campaignId)).launch.starship).toMatchObject({
      provenance: 'guide_proposal',
    });
  });

  it('proposes one quirk when one was rolled', async () => {
    const campaignId = await campaign();

    const result = await proposeStarship(db.sql, devStub(), {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      groundedIn: await roll(campaignId, 1),
    });

    expect(result.ok && result.proposal.quirks).toHaveLength(1);
  });

  it('refuses before asking the Guide when a slot has no roll', async () => {
    const campaignId = await campaign();
    const [name] = await roll(campaignId, 2);
    const ai = new StubProvider();

    await expect(
      proposeStarship(db.sql, ai, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        groundedIn: [name!],
      }),
    ).rejects.toMatchObject({ reason: 'no_rolls' });
    expect(ai.requests).toHaveLength(0);
  });

  it('reads accepted facts and never a saved draft (D-161)', async () => {
    const campaignId = await campaign();
    const truth = STARFORGED.truths[1]!;
    await decideTruth(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: truth.id,
      resolution: 'custom',
      text: 'ACCEPTED-TRUTH-MARKER',
    });
    await saveLaunchDraft(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      draft: {
        section: 'starship',
        snapshot: { starship: { name: 'DRAFT-ONLY-MARKER' } },
      },
    });
    const ai = devStub() as StubProvider;

    await proposeStarship(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      groundedIn: await roll(campaignId, 2),
    });

    const user = ai.requests[0]?.user ?? '';
    // The positive control: without it, an empty context would pass too.
    expect(user).toContain('ACCEPTED-TRUTH-MARKER');
    expect(user).not.toContain('DRAFT-ONLY-MARKER');
  });

  it('is refused for a campaign already in play (D-178)', async () => {
    const campaignId = await campaign();
    const groundedIn = await roll(campaignId, 2);
    await beginSession(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      scene: { title: 'The dock' },
    });

    await expect(
      proposeStarship(db.sql, devStub(), {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        groundedIn,
      }),
    ).rejects.toBeInstanceOf(AiRequestRefusedError);
  });
});
