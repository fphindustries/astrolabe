import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED, type OracleId } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { readEvents } from './event-store.js';
import { decideTruth } from './launch-commands.js';
import { proposeTruth } from './proposal-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

/**
 * Task 5.3: the Guide recommends an answer to one setting truth.
 *
 * The property under test throughout is that a proposal is **not canon**
 * (D-161): it writes `creation.proposed` and nothing else, the truth stays
 * undecided, and accepting is the separate `decideTruth` command the manual
 * paths already use.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const TRUTH = STARFORGED.truths[0]!;

describe.skipIf(!hasTestDatabase)('proposing a setting truth (5.3)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('truth_proposals');
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

  const stub = (value: unknown) => new StubProvider({ responses: [{ kind: 'structured', value }] });

  it('recommends an official option and records what it meant, without deciding it', async () => {
    const campaignId = await campaign();
    const ai = stub({ resolution: 'selected', optionIndex: 1, reason: 'It fits the premise.' });

    const result = await proposeTruth(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: TRUTH.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The index is recorded, not just the text: two options can read alike, and
    // a review screen has to preselect the right one after a reload (A41).
    expect(result.proposal.proposal).toMatchObject({
      truthId: TRUTH.id,
      resolution: 'selected',
      optionIndex: 1,
      text: TRUTH.rows[1]!.description,
    });

    const state = project(await readEvents(db.sql, campaignId));
    // Proposed, not decided. This is the D-161 boundary in one assertion.
    expect(state.launch.truthDecisions[TRUTH.id]).toBeUndefined();
    expect(state.launch.proposals[TRUTH.id]).toMatchObject({ targetKind: 'truth' });
  });

  it('cites no oracle roll, and rolls none', async () => {
    // D-166 has the server roll a declared recipe before the Guide interprets
    // it; a truth has no recipe because its own table is its option set. The
    // absence is the design, so it is asserted rather than assumed.
    const campaignId = await campaign();
    const ai = stub({ resolution: 'selected', optionIndex: 0, reason: 'Because.' });

    const result = await proposeTruth(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: TRUTH.id,
    });

    expect(result.ok && result.proposal.groundedIn).toEqual([]);
    const events = await readEvents(db.sql, campaignId);
    expect(events.filter((event) => event.type === 'oracle.rolled')).toHaveLength(0);
  });

  it('carries a chosen option’s quest starter as inspiration (A25, D-162)', async () => {
    const campaignId = await campaign();
    const withStarter = TRUTH.rows.findIndex((row) => row.questStarter !== undefined);
    expect(withStarter).toBeGreaterThanOrEqual(0);
    const ai = stub({ resolution: 'selected', optionIndex: withStarter, reason: 'Because.' });

    const result = await proposeTruth(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: TRUTH.id,
    });

    expect(result.ok && result.proposal.proposal.questStarter).toBe(
      TRUTH.rows[withStarter]!.questStarter,
    );
  });

  it('drafts custom wording when it recommends the player’s own answer', async () => {
    const campaignId = await campaign();
    const ai = stub({
      resolution: 'custom',
      text: 'A slow collapse nobody agrees to call a cataclysm.',
      reason: 'The premise describes an argument, not an event.',
    });

    const result = await proposeTruth(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: TRUTH.id,
    });

    expect(result.ok && result.proposal.proposal).toMatchObject({
      resolution: 'custom',
      text: 'A slow collapse nobody agrees to call a cataclysm.',
    });
    expect(result.ok && result.proposal.proposal.optionIndex).toBeUndefined();
  });

  it('re-asks a recommendation whose resolution and fields disagree', async () => {
    // The schema cannot say "selected needs an index"; the check can.
    const campaignId = await campaign();
    const ai = new StubProvider({
      responses: [
        { kind: 'structured', value: { resolution: 'selected', reason: 'No index given.' } },
        {
          kind: 'structured',
          value: { resolution: 'selected', optionIndex: 2, reason: 'Better.' },
        },
      ],
    });

    const result = await proposeTruth(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: TRUTH.id,
    });

    expect(result.ok && result.proposal.proposal.optionIndex).toBe(2);
    expect(ai.requests).toHaveLength(2);
  });

  it('reports a provider failure as an outcome, leaving the truth decidable (A42)', async () => {
    const campaignId = await campaign();
    const ai = new StubProvider({
      responses: [{ kind: 'error', errorKind: 'unavailable', message: 'No provider.' }],
    });

    const result = await proposeTruth(db.sql, ai, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: TRUTH.id,
    });

    expect(result).toMatchObject({ ok: false, errorKind: 'unavailable' });

    // The whole of A42 in one sequence: the Guide being unavailable disables
    // the proposal and nothing else — the manual path still decides the truth.
    await decideTruth(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      truthId: TRUTH.id,
      resolution: 'custom',
      text: 'Decided by hand, with no Guide.',
    });
    const state = project(await readEvents(db.sql, campaignId));
    expect(state.launch.truthDecisions[TRUTH.id]?.text).toBe('Decided by hand, with no Guide.');
  });

  it('refuses an id that is not a setting truth', async () => {
    const campaignId = await campaign();
    const ai = stub({ resolution: 'custom', text: 'x', reason: 'y' });

    await expect(
      proposeTruth(db.sql, ai, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        truthId: 'oracle:not-a-truth' as OracleId,
      }),
    ).rejects.toThrow(/not a setting truth/i);
  });
});
