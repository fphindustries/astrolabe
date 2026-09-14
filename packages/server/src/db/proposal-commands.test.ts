import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { CHARACTER_PROPOSAL_ROLLS } from '../ai/context/index.js';
import { StubProvider } from '../ai/stub.js';
import { loadedDice } from '../fixtures/loaded-dice.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { createCharacter, UnknownProposalError } from './character-commands.js';
import { readEvents } from './event-store.js';
import { AiRequestRefusedError } from './narration-commands.js';
import { proposeCharacter } from './proposal-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const CONCEPT =
  'A former evacuation pilot who still flies toward the distress calls everyone else ignores.';

/** A proposal that passes every rule, as the AI would answer it. */
function goodProposal(overrides: Record<string, unknown> = {}) {
  return {
    name: {
      value: 'Mara Oduya',
      reason: 'The given and family rolls, together.',
      groundedIn: ['given-name', 'family-name'],
    },
    callsign: {
      value: 'Lantern',
      reason: 'She leaves a light on for strays.',
      groundedIn: ['callsign'],
    },
    stats: {
      value: { edge: 3, heart: 2, iron: 1, shadow: 1, wits: 2 },
      reason: 'A pilot lives on edge.',
    },
    assets: [
      { assetId: 'asset:path/ace', reason: 'She flies.' },
      { assetId: 'asset:path/navigator', reason: 'She finds the way out.' },
      { assetId: 'asset:module/sensor-array', reason: 'She hears distress calls first.' },
    ],
    backgroundVow: {
      title: 'Answer the call that no one else will',
      rank: 'dangerous',
      reason: 'The heart of the concept.',
    },
    hooks: [
      {
        text: 'A settlement she could not evacuate still broadcasts.',
        reason: 'The first prompt.',
        groundedIn: ['backstory-1'],
      },
      {
        text: 'She owes a debt to a rival pilot.',
        reason: 'The second prompt.',
        groundedIn: ['backstory-2'],
      },
    ],
    ...overrides,
  };
}

/** Five d100 faces, one per roll D-123 names. */
const rolls = () =>
  loadedDice(CHARACTER_PROPOSAL_ROLLS.map((_, i) => ({ sides: 100, face: 11 + i * 17 })));

describe.skipIf(!hasTestDatabase)('character proposals (task 3.3, D-123, D-124)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('proposals');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  async function campaign(): Promise<CampaignId> {
    const campaignId = newId<CampaignId>();
    await createCampaign(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      name: 'Lantern Wake',
    });
    return campaignId;
  }

  it('rolls, asks, and writes the rolls, the accounting and the proposal as one command', async () => {
    const campaignId = await campaign();
    const ai = new StubProvider({ responses: [{ kind: 'structured', value: goodProposal() }] });
    const commandId = newId<CommandId>();

    const result = await proposeCharacter(db.sql, ai, {
      campaignId,
      commandId,
      actor: PLAYER,
      concept: CONCEPT,
      rng: rolls(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rolls.map((r) => r.label)).toEqual(CHARACTER_PROPOSAL_ROLLS.map((r) => r.label));
    const [given, family, callsign, backstory] = result.rolls;
    expect(result.proposal.name.groundedIn).toEqual([given?.eventId, family?.eventId]);
    expect(result.proposal.callsign.groundedIn).toEqual([callsign?.eventId]);
    expect(result.proposal.hooks[0]?.groundedIn).toEqual([backstory?.eventId]);

    // What the AI was told: the concept, the rolls, a trimmed catalogue.
    const asked = ai.requests[0];
    expect(asked?.user).toContain(CONCEPT);
    expect(asked?.user).toContain(`callsign (Callsign): ${callsign?.rowText}`);
    expect(asked?.system[1]?.text).toContain('asset:path/ace | Ace | path |');
    expect(asked?.system[1]?.text).not.toContain('asset:deed/');
    expect(asked?.system[1]?.text).not.toContain('asset:command-vehicle/');

    const events = await readEvents(db.sql, campaignId);
    const written = events.filter((e) => e.commandId === commandId).map((e) => e.type);
    expect(written).toEqual([
      ...CHARACTER_PROPOSAL_ROLLS.map(() => 'oracle.rolled'),
      'ai.completed',
      'character.proposed',
    ]);
    for (const roll of result.rolls) {
      const table = STARFORGED.oracles.find((t) => t.id === roll.oracleId);
      expect(table?.rows.some((row) => row.text === roll.rowText)).toBe(true);
    }

    // Before any session: counted for the campaign, not for a session (D-125).
    const state = project(events);
    expect(state.session).toBeNull();
    expect(state.tokenUsage).toMatchObject({ input: 100, output: 20 });
    expect(Object.keys(state.characters)).toHaveLength(0);
  });

  it('replays a proposal command without asking again', async () => {
    const campaignId = await campaign();
    const ai = new StubProvider({ responses: [{ kind: 'structured', value: goodProposal() }] });
    const request = {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      concept: CONCEPT,
      rng: rolls(),
    };

    const first = await proposeCharacter(db.sql, ai, request);
    const again = await proposeCharacter(db.sql, ai, request);

    expect(again).toEqual(first);
    expect(ai.requests).toHaveLength(1);
  });

  it('labels each roll by its own table, in roll order, on a replay as on the first answer', async () => {
    // `outcomeFrom` labels the i-th `oracle.rolled` with the i-th roll spec,
    // so a read that returned the rolls out of order would mislabel them.
    const campaignId = await campaign();
    const ai = new StubProvider({ responses: [{ kind: 'structured', value: goodProposal() }] });
    const request = {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      concept: CONCEPT,
      rng: rolls(),
    };

    const first = await proposeCharacter(db.sql, ai, request);
    const again = await proposeCharacter(db.sql, ai, request);
    if (!first.ok || !again.ok) throw new Error('Expected both answers to succeed.');

    const expected = CHARACTER_PROPOSAL_ROLLS.map((spec) => [spec.label, spec.oracleId]);
    expect(first.rolls.map((r) => [r.label, r.oracleId])).toEqual(expected);
    expect(again.rolls.map((r) => [r.label, r.oracleId])).toEqual(expected);
    expect(again.rolls.map((r) => r.eventId)).toEqual(first.rolls.map((r) => r.eventId));

    // The log order the labels rely on is the order the rolls were written in.
    const written = (await readEvents(db.sql, campaignId))
      .filter((e) => e.commandId === request.commandId && e.type === 'oracle.rolled')
      .map((e) => e.id);
    expect(again.rolls.map((r) => r.eventId)).toEqual(written);

    // And the citations still point at the rolls their labels name.
    const byLabel = (label: string) =>
      again.rolls.filter((r) => r.label === label).map((r) => r.eventId);
    expect(again.proposal.name.groundedIn).toEqual([
      ...byLabel('Given name'),
      ...byLabel('Family name'),
    ]);
    expect(again.proposal.callsign.groundedIn).toEqual(byLabel('Callsign'));
  });

  it('re-asks with the rules problem stated, and counts both attempts', async () => {
    const campaignId = await campaign();
    const ai = new StubProvider({
      responses: [
        {
          kind: 'structured',
          value: goodProposal({
            stats: {
              value: { edge: 3, heart: 3, iron: 1, shadow: 1, wits: 2 },
              reason: 'Too much.',
            },
          }),
        },
        { kind: 'structured', value: goodProposal() },
      ],
    });

    const result = await proposeCharacter(db.sql, ai, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      concept: CONCEPT,
      rng: rolls(),
    });

    expect(result.ok).toBe(true);
    expect(ai.requests[1]?.user).toMatch(
      /previous answer was rejected: Stats are assigned from 3, 2, 2, 1, 1/,
    );
    const events = await readEvents(db.sql, campaignId);
    expect(events.filter((e) => e.type === 'ai.completed')).toHaveLength(2);
  });

  it('rejects ungrounded detail and a build that breaks the slot rules', async () => {
    const campaignId = await campaign();
    const ungrounded = goodProposal({
      callsign: { value: 'Ghost', reason: 'Invented.', groundedIn: [] },
      assets: [
        { assetId: 'asset:path/ace', reason: 'a' },
        { assetId: 'asset:module/sensor-array', reason: 'b' },
        { assetId: 'asset:module/shields', reason: 'c' },
      ],
    });
    const ai = new StubProvider({
      responses: [
        { kind: 'structured', value: ungrounded },
        { kind: 'structured', value: ungrounded },
      ],
    });

    const result = await proposeCharacter(db.sql, ai, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      concept: CONCEPT,
      rng: rolls(),
    });

    expect(result).toMatchObject({ ok: false, errorKind: 'invalid_output' });
    if (result.ok) return;
    expect(result.message).toMatch(/callsign cites no oracle roll/);
    expect(result.message).toMatch(/path/i);
    // The dice were rolled, so the rolls stay written, with the failure.
    const types = (await readEvents(db.sql, campaignId)).map((e) => e.type);
    expect(types.filter((t) => t === 'oracle.rolled')).toHaveLength(5);
    expect(types).toContain('ai.failed');
    expect(types).not.toContain('character.proposed');
  });

  it('lets a name the player wrote into the concept stand without a roll', async () => {
    const campaignId = await campaign();
    const ai = new StubProvider({
      responses: [
        {
          kind: 'structured',
          value: goodProposal({
            name: { value: 'Isolde Varga', reason: 'The player named her.', groundedIn: [] },
            // Found live: the callsign sat between the names, and the check
            // pushed the AI to rename her to earn a citation.
            callsign: { value: 'Wick', reason: 'The player named her.', groundedIn: [] },
          }),
        },
      ],
    });

    const result = await proposeCharacter(db.sql, ai, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      concept: `Isolde "Wick" Varga, ${CONCEPT}`,
      rng: rolls(),
    });

    expect(result).toMatchObject({
      ok: true,
      proposal: {
        name: { value: 'Isolde Varga', groundedIn: [] },
        callsign: { value: 'Wick', groundedIn: [] },
      },
    });
    expect(ai.requests).toHaveLength(1);
  });

  it('recovers when only a citation was wrong, and never exempts a name found inside another word', async () => {
    const campaignId = await campaign();
    const ai = new StubProvider({
      responses: [
        {
          kind: 'structured',
          // "Ace" appears in the concept only inside "spacer": still ungrounded.
          value: goodProposal({
            callsign: { value: 'Ace', reason: 'Close enough.', groundedIn: [] },
          }),
        },
        { kind: 'structured', value: goodProposal() },
      ],
    });

    const result = await proposeCharacter(db.sql, ai, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      concept: `A spacer. ${CONCEPT}`,
      rng: rolls(),
    });

    expect(result).toMatchObject({ ok: true, proposal: { callsign: { value: 'Lantern' } } });
    expect(ai.requests[1]?.user).toMatch(/callsign cites no oracle roll/);
  });

  it('records an outage with its rolls and no proposal', async () => {
    const campaignId = await campaign();
    const ai = new StubProvider({ responses: [{ kind: 'error', errorKind: 'unavailable' }] });

    const result = await proposeCharacter(db.sql, ai, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      concept: CONCEPT,
      rng: rolls(),
    });

    expect(result).toMatchObject({ ok: false, errorKind: 'unavailable' });
    expect(result.rolls).toHaveLength(5);
  });

  it('refuses an empty concept before rolling anything', async () => {
    const campaignId = await campaign();
    await expect(
      proposeCharacter(db.sql, new StubProvider(), {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        concept: '   ',
      }),
    ).rejects.toBeInstanceOf(AiRequestRefusedError);
    expect(await readEvents(db.sql, campaignId)).toHaveLength(1);
  });

  it('accepts a proposal through createCharacter, naming it as the cause and keeping the hooks', async () => {
    const campaignId = await campaign();
    const ai = new StubProvider({ responses: [{ kind: 'structured', value: goodProposal() }] });
    const proposalCommandId = newId<CommandId>();
    const proposed = await proposeCharacter(db.sql, ai, {
      campaignId,
      commandId: proposalCommandId,
      actor: PLAYER,
      concept: CONCEPT,
      rng: rolls(),
    });
    if (!proposed.ok) throw new Error('expected a proposal');

    // The player edited the callsign and one hook before accepting.
    const created = await createCharacter(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      draft: {
        name: proposed.proposal.name.value,
        callsign: 'Wick',
        stats: proposed.proposal.stats.value,
        assets: proposed.proposal.assets.map((a) => a.assetId),
      },
      backgroundVow: proposed.proposal.backgroundVow,
      hooks: ['A settlement she could not evacuate still broadcasts.', '  '],
      proposalCommandId,
    });

    const character = created.result.events.find((e) => e.type === 'character.created');
    expect(character?.causedBy).toBe(proposed.proposalEventId);
    const state = project(await readEvents(db.sql, campaignId));
    expect(state.characters[created.characterId]).toMatchObject({
      callsign: 'Wick',
      hooks: ['A settlement she could not evacuate still broadcasts.'],
    });
  });

  it('refuses a proposal command that holds no character proposal', async () => {
    const campaignId = await campaign();
    await expect(
      createCharacter(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        draft: {
          name: 'Nobody',
          callsign: 'None',
          stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
          assets: ['asset:path/ace', 'asset:path/navigator', 'asset:module/shields'] as never,
        },
        proposalCommandId: newId(),
      }),
    ).rejects.toBeInstanceOf(UnknownProposalError);
  });
});
