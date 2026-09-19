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
import { decideTruth, rollLaunchRecipe, saveLaunchDraft } from './launch-commands.js';
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
