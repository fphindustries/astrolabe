import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';
import {
  CONNECTION_PROPOSAL_TARGET,
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type EventId,
} from '@astrolabe/shared';

import { checkConnectionProposal, connectionProposalRolls } from '../ai/context/connection.js';
import { createProviderFromEnv } from '../ai/create-provider.js';
import { StubProvider } from '../ai/stub.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { readEvents } from './event-store.js';
import {
  decideTruth,
  establishLaunchConnection,
  rollLaunchRecipe,
  saveLaunchDraft,
} from './launch-commands.js';
import { createCharacter } from './character-commands.js';
import { AiRequestRefusedError } from './narration-commands.js';
import { proposeConnection } from './proposal-commands.js';
import { beginSession } from './session-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

/**
 * Task 9.0c: the Guide reads the NPC recipe's rolls into the local
 * connection (beat 10, D-167). The properties are D-166's — the server rolls
 * before the Guide interprets, each field cites its rolls, nothing is canon —
 * and D-167's: the proposal is only a person, never the connection's outcome.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const devStub = () => createProviderFromEnv({ ASTROLABE_AI_PROVIDER: 'stub' });

describe('checkConnectionProposal', () => {
  const keys = connectionProposalRolls().map((roll) => roll.key);
  const cite = (key: string) => ({ value: 'v', reason: 'r', groundedIn: [key] });

  it('keys its rolls by the NPC recipe’s slots', () => {
    expect(keys).toEqual([
      'role',
      'goal',
      'first_look',
      'disposition',
      'given_name',
      'family_name',
    ]);
  });

  it('refuses a field that cites no roll', () => {
    const value = {
      npcName: cite('given_name'),
      role: cite('role'),
      goal: { value: 'v', reason: 'r', groundedIn: [] },
      firstLook: cite('first_look'),
      disposition: cite('disposition'),
      reason: 'r',
    };
    expect(checkConnectionProposal(value, keys)).toMatch(/goal cites no oracle roll/);
  });
});

describe.skipIf(!hasTestDatabase)('proposing the local connection (9.0c)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('connection_proposals');
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

  async function roll(campaignId: CampaignId): Promise<EventId[]> {
    const rolled = await rollLaunchRecipe(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      selector: { kind: 'starting_connection' },
      rng: { next: () => 0.305 },
    });
    return rolled.events.map((event) => event.id);
  }

  it('grounds each field in its roll, and is a proposal, not the connection', async () => {
    const campaignId = await campaign();
    const groundedIn = await roll(campaignId);

    const result = await proposeConnection(db.sql, devStub(), {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      groundedIn,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.npcName.groundedIn).toHaveLength(2);
    for (const field of [result.proposal.role, result.proposal.goal, result.proposal.disposition])
      expect(field.groundedIn.length).toBeGreaterThan(0);
    const events = await readEvents(db.sql, campaignId);
    const state = project(events);
    expect(state.launch.connection).toBeUndefined();
    expect(state.launch.proposals[CONNECTION_PROPOSAL_TARGET]?.targetKind).toBe('connection');
    // D-167: the proposal is a person; nothing rolled the connection's outcome.
    expect(events.some((event) => event.type === 'dice.rolled')).toBe(false);
  });

  it('refuses before asking the Guide when a slot has no roll', async () => {
    const campaignId = await campaign();
    const [first] = await roll(campaignId);
    const ai = new StubProvider();

    await expect(
      proposeConnection(db.sql, ai, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        groundedIn: [first!],
      }),
    ).rejects.toMatchObject({ reason: 'no_rolls' });
    expect(ai.requests).toHaveLength(0);
  });

  it('reads accepted facts and never a saved draft (D-161)', async () => {
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
      draft: {
        section: 'connection_troubles',
        snapshot: { connection: { npcName: 'DRAFT-ONLY-MARKER' }, troubles: [] },
      },
    });
    const ai = devStub() as StubProvider;

    await proposeConnection(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      groundedIn: await roll(campaignId),
    });

    const user = ai.requests[0]?.user ?? '';
    expect(user).toContain('ACCEPTED-TRUTH-MARKER');
    expect(user).not.toContain('DRAFT-ONLY-MARKER');
  });

  // 9.0d — accepting names the proposal, and the server decides whether it was edited.
  async function crew(campaignId: CampaignId) {
    const paths = STARFORGED.assets
      .filter((asset) => asset.categoryId === 'path')
      .slice(0, 3)
      .map((asset) => asset.id);
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
      launch: { appearance: 'Weathered jacket', backstory: { kind: 'discover_in_play' } },
    });
    return characterId;
  }

  async function proposed(campaignId: CampaignId) {
    const result = await proposeConnection(db.sql, devStub(), {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      groundedIn: await roll(campaignId),
    });
    if (!result.ok) throw new Error('expected a proposal');
    return result;
  }

  it('accepts the proposed person as the Guide’s, with every roll, and a rank of the player’s', async () => {
    const campaignId = await campaign();
    const vesna = await crew(campaignId);
    const { proposal, proposalEventId } = await proposed(campaignId);

    const established = await establishLaunchConnection(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      npcName: proposal.npcName.value,
      role: proposal.role.value,
      rank: 'dangerous',
      participants: [vesna],
      details: {
        goal: proposal.goal.value,
        firstLook: proposal.firstLook.value,
        disposition: proposal.disposition.value,
      },
      proposalEventId,
    });

    expect(established.events.every((event) => event.causedBy === proposalEventId)).toBe(true);
    const state = project(await readEvents(db.sql, campaignId));
    expect(state.launch.connection).toMatchObject({
      provenance: 'guide_proposal',
      rank: 'dangerous',
    });
    expect(state.launch.connection?.groundedIn.length).toBeGreaterThanOrEqual(6);
    expect(state.entities[state.launch.connection!.npcId]).toMatchObject({
      fields: { role: proposal.role.value, goal: proposal.goal.value },
      provenance: { establishedBy: 'ai' },
    });
  });

  it('records an edited field as edited, and drops the roll behind it', async () => {
    const campaignId = await campaign();
    const vesna = await crew(campaignId);
    const { proposal, proposalEventId } = await proposed(campaignId);

    await establishLaunchConnection(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      npcName: proposal.npcName.value,
      role: 'Harbourmaster',
      rank: 'dangerous',
      participants: [vesna],
      details: {
        goal: proposal.goal.value,
        firstLook: proposal.firstLook.value,
        disposition: proposal.disposition.value,
      },
      proposalEventId,
    });

    const state = project(await readEvents(db.sql, campaignId));
    expect(state.launch.connection?.provenance).toBe('guide_proposal_edited');
    expect(state.launch.connection?.groundedIn).not.toContain(proposal.role.groundedIn[0]);
    expect(state.entities[state.launch.connection!.npcId]?.provenance.establishedBy).toBe('player');
  });

  it('is refused for a campaign already in play (D-178)', async () => {
    const campaignId = await campaign();
    const groundedIn = await roll(campaignId);
    await beginSession(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      scene: { title: 'The dock' },
    });

    await expect(
      proposeConnection(db.sql, devStub(), {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        groundedIn,
      }),
    ).rejects.toBeInstanceOf(AiRequestRefusedError);
  });
});
