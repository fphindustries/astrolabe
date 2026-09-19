import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  createSeededRandomSource,
  STARFORGED,
  type CharacterId,
  type MoveId,
} from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type AiStatusResponse,
  type CampaignId,
  type CommandId,
  type NarrationFrame,
} from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import { createCharacter } from '../db/character-commands.js';
import { appendCommand, readEvents } from '../db/event-store.js';
import { invokeMove } from '../db/move-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { uuidv7 } from '../db/uuid.js';
import { project } from '../projection/project.js';

import { buildApp } from './app.js';

const PLAYER = { kind: 'player', playerId: LOCAL_PLAYER_ID } as const;
const newId = <T>(): T => uuidv7() as T;

function frames(body: string): NarrationFrame[] {
  return body
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as NarrationFrame);
}

describe.skipIf(!hasTestDatabase)('the AI routes (group 7)', () => {
  let db: TestDatabase;
  let ai: StubProvider;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDatabase('ai_routes');
    ai = new StubProvider();
    app = buildApp({ sql: db.sql, ai, checker: new StubProvider() });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  /** A campaign with Rook, an active session, and one resolved Gather Information. */
  async function moveMade(): Promise<{
    campaignId: CampaignId;
    characterId: CharacterId;
    moveCommandId: CommandId;
  }> {
    const campaignId = newId<CampaignId>();
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId(),
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
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      draft: {
        name: 'Juno Marr',
        callsign: 'Juno',
        stats: { edge: 1, heart: 2, iron: 1, shadow: 2, wits: 3 },
        assets: [],
      },
    });
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId(),
      kind: 'session.begin',
      actor: PLAYER,
      events: [{ type: 'session.began', payload: { sessionId: newId(), number: 2 } }],
    });
    const moveCommandId = newId<CommandId>();
    await invokeMove(db.sql, {
      campaignId,
      commandId: moveCommandId,
      actor: PLAYER,
      moveId: 'move:adventure/gather-information' as MoveId,
      actorCharacterId: characterId,
      using: { using: 'stat', stat: 'wits' },
      adds: [],
      actionText: 'Juno jacks into the docking port and pulls the station logs.',
      rng: createSeededRandomSource(3),
    });
    return { campaignId, characterId, moveCommandId };
  }

  it('reports the Guide’s availability', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/ai/status' });
    expect(response.json<AiStatusResponse>()).toMatchObject({
      provider: 'stub',
      configured: true,
      available: true,
    });
  });

  it('streams a passage as NDJSON frames ending in committed (D-111)', async () => {
    const { campaignId, moveCommandId } = await moveMade();
    ai.enqueue({
      kind: 'structured',
      value: {
        segments: [
          {
            about: 'character_undergoes',
            character: 'Juno',
            basis: ['F1'],
            text: 'The logs spill across Juno’s screen in broken fragments.',
          },
        ],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/narrations`,
      payload: { commandId: newId(), afterCommandId: moveCommandId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/x-ndjson/);
    const received = frames(response.body);
    expect(received.at(-1)?.type).toBe('committed');
    expect(
      received
        .filter((f): f is Extract<NarrationFrame, { type: 'delta' }> => f.type === 'delta')
        .map((f) => f.text)
        .join(''),
    ).toBe('The logs spill across Juno’s screen in broken fragments.');
  });

  it('refuses with 422 before any stream opens', async () => {
    const { campaignId, moveCommandId } = await moveMade();
    await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/narrations`,
      payload: { commandId: newId(), afterCommandId: moveCommandId },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/narrations`,
      payload: { commandId: newId(), afterCommandId: moveCommandId },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ reason: 'already_narrated' });
  });

  it('closes a failed call with a failed frame, and the status turns unavailable (D-116)', async () => {
    const { campaignId, moveCommandId } = await moveMade();
    ai.enqueue({ kind: 'error', errorKind: 'unavailable', message: 'overloaded' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/narrations`,
      payload: { commandId: newId(), afterCommandId: moveCommandId },
    });

    expect(frames(response.body)).toEqual([
      { type: 'failed', errorKind: 'unavailable', message: 'overloaded' },
    ]);
    const status = await app.inject({ method: 'GET', url: '/api/ai/status' });
    expect(status.json<AiStatusResponse>()).toMatchObject({
      available: false,
      lastFailure: { errorKind: 'unavailable' },
    });

    // The retry the paused screen offers.
    const retry = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/narrations`,
      payload: { commandId: newId(), afterCommandId: moveCommandId },
    });
    expect(frames(retry.body).at(-1)?.type).toBe('committed');
    expect(
      (await app.inject({ method: 'GET', url: '/api/ai/status' })).json<AiStatusResponse>()
        .available,
    ).toBe(true);
  });

  it('corrects a passage in one request (A15)', async () => {
    const { campaignId, moveCommandId } = await moveMade();
    ai.enqueue({
      kind: 'structured',
      value: {
        segments: [
          {
            about: 'character_undergoes',
            character: 'Juno',
            basis: ['F1'],
            text: 'Juno frowns, shaken.',
          },
        ],
      },
    });
    const narrated = frames(
      (
        await app.inject({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/narrations`,
          payload: { commandId: newId(), afterCommandId: moveCommandId },
        })
      ).body,
    ).at(-1);
    if (narrated?.type !== 'committed') throw new Error('expected a passage');
    ai.enqueue({ kind: 'text', text: 'Juno works steadily.' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/narrations/${narrated.eventId}/corrections`,
      payload: { commandId: newId(), note: 'The AI must not narrate Juno’s feelings.' },
    });

    expect(frames(response.body).at(-1)?.type).toBe('committed');
    const log = await app.inject({ method: 'GET', url: `/api/campaigns/${campaignId}/log` });
    expect(log.body).toContain('Juno works steadily.');
  });

  it('proposes an amount (D-118)', async () => {
    const { campaignId, characterId } = await moveMade();
    ai.enqueue({
      kind: 'structured',
      value: {
        amount: -1,
        injury: "A falling panel glances off Rook's shoulder plate.",
        reason: 'The armour took most of it.',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/amount-proposals`,
      payload: {
        commandId: newId(),
        moveId: 'move:suffer/endure-harm',
        actorCharacterId: characterId,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      ok: true,
      amount: -1,
      injury: "A falling panel glances off Rook's shoulder plate.",
      reason: 'The armour took most of it.',
    });
  });

  it('proposes a character from a concept, and accepting it keeps the hooks (3.3, D-124, D-189)', async () => {
    // A campaign still in Campaign Launch, not one in play: asking the Guide
    // for a character grounds itself in a declared launch recipe, which a
    // campaign with a session refuses (D-178, D-189). The manual path is what
    // remains available in play.
    const campaignId = newId<CampaignId>();
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId(),
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
    ai.enqueue({
      kind: 'structured',
      value: {
        name: { value: 'Mara Oduya', reason: 'The rolls.', groundedIn: ['given-name'] },
        callsign: { value: 'Lantern', reason: 'The roll.', groundedIn: ['callsign'] },
        stats: { value: { edge: 3, heart: 2, iron: 1, shadow: 1, wits: 2 }, reason: 'A pilot.' },
        assets: [
          { assetId: 'asset:path/ace', reason: 'She flies.' },
          { assetId: 'asset:path/navigator', reason: 'She navigates.' },
          { assetId: 'asset:module/sensor-array', reason: 'She listens.' },
        ],
        backgroundVow: { title: 'Answer every call', rank: 'dangerous', reason: 'The concept.' },
        hooks: [
          {
            text: 'A lost settlement still broadcasts.',
            reason: 'Prompt.',
            groundedIn: ['backstory-1'],
          },
          { text: 'She owes a rival.', reason: 'Prompt.', groundedIn: ['backstory-2'] },
        ],
        pronouns: { value: null, reason: 'The concept states none.' },
        appearance: { value: 'A worn flight jacket.', reason: 'A working pilot.' },
        backstory: {
          kind: 'written',
          text: 'She flew the last shuttle out.',
          reason: 'From the prompts.',
          groundedIn: ['backstory-1', 'backstory-2'],
        },
        signatureGear: { value: null, reason: 'Nothing the concept names.' },
      },
    });
    const proposalCommandId = newId<CommandId>();

    // D-186: the recipe is rolled by its own command, and the proposal cites it.
    const rolled = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/launch/recipe-rolls`,
      payload: { commandId: newId<CommandId>(), selector: { kind: 'character' } },
    });
    expect(rolled.statusCode).toBe(201);
    const groundedIn = rolled.json().results.map((result: { eventId: string }) => result.eventId);

    const proposed = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/character-proposals`,
      payload: {
        commandId: proposalCommandId,
        concept: 'A pilot who answers every call.',
        targetId: 'draft-vesna',
        groundedIn,
      },
    });
    expect(proposed.statusCode).toBe(201);
    const body = proposed.json();
    expect(body).toMatchObject({ ok: true, proposal: { callsign: { value: 'Lantern' } } });
    expect(body.rolls).toHaveLength(5);
    // A proposal belongs to no session. Before launch there is none to belong
    // to, which is the point D-189 settles — this is where crew is built.
    const proposalEvents = (await readEvents(db.sql, campaignId)).filter(
      (e) => e.commandId === proposalCommandId,
    );
    expect(proposalEvents.map((e) => e.sessionId)).toEqual(proposalEvents.map(() => null));
    const log = await app.inject({ method: 'GET', url: `/api/campaigns/${campaignId}/log` });
    expect(log.body).not.toContain(body.rolls[0].eventId);

    const created = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/characters`,
      payload: {
        commandId: newId(),
        draft: {
          name: 'Mara Oduya',
          callsign: 'Lantern',
          stats: body.proposal.stats.value,
          assets: ['asset:path/ace', 'asset:path/navigator', 'asset:module/sensor-array'],
        },
        hooks: ['A lost settlement still broadcasts.'],
        proposalCommandId,
      },
    });
    expect(created.statusCode).toBe(201);
    const state = project(await readEvents(db.sql, campaignId));
    const mara = Object.values(state.characters).find((c) => c.callsign === 'Lantern');
    expect(mara?.hooks).toEqual(['A lost settlement still broadcasts.']);

    const empty = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/character-proposals`,
      payload: { commandId: newId(), concept: '' },
    });
    expect(empty.statusCode).toBe(400);
  });

  // D-132's incident proposal, launch-scoped since 9.0e (D-178): proposed
  // while launch is open, refused once a campaign is in play. Swearing the
  // chosen incident is activation's and the vow move's now (D-201), so the
  // Milestone 1 inciting-vow route is tested on its own, in app.test.ts.
  it('proposes inciting incidents during launch, and refuses them in play (4.6, D-132, 9.0e)', async () => {
    const campaignId = newId<CampaignId>();
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId(),
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
    const { characterId } = await createCharacter(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      draft: {
        name: 'Juno Marr',
        callsign: 'Juno',
        stats: { edge: 1, heart: 2, iron: 1, shadow: 2, wits: 3 },
        assets: [],
      },
    });
    ai.enqueue({
      kind: 'structured',
      value: {
        options: [1, 2, 3].map((n) => ({
          title: `Answer incident ${n}`,
          rank: 'dangerous',
          situation: `Incident ${n} has reached the relay.`,
          reason: `Roll ${n}.`,
          groundedIn: [`incident-${n}`],
          drawsOn: { crew: ['Juno'] },
        })),
      },
    });

    const proposed = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/incident-proposals`,
      payload: { commandId: newId() },
    });
    expect(proposed.statusCode).toBe(201);
    const body = proposed.json();
    expect(body).toMatchObject({ ok: true });
    expect(body.rolls).toHaveLength(3);
    expect(body.proposal.options[0].drawsOn).toEqual({
      truths: [],
      locations: [],
      characters: [characterId],
    });
    // Held for review, so a reload keeps it (9.0e).
    expect(project(await readEvents(db.sql, campaignId)).launch.incidentProposal).toMatchObject({
      eventId: body.proposalEventId,
    });
    // And its rolls resolve as chips in the workspace (A41).
    const workspace = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}/launch`,
    });
    expect(Object.keys(workspace.json().chips)).toEqual(
      expect.arrayContaining(body.rolls.map((roll: { eventId: string }) => roll.eventId)),
    );

    const { campaignId: inPlay } = await moveMade();
    const refused = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${inPlay}/incident-proposals`,
      payload: { commandId: newId() },
    });
    expect(refused.statusCode).toBe(422);

    const malformed = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/incident-proposals`,
      payload: {},
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('proposes a setting truth over HTTP, and answers a failure as an outcome (5.3, A42)', async () => {
    const { campaignId } = await moveMade();
    const truth = STARFORGED.truths[0]!;

    ai.enqueue({
      kind: 'structured',
      value: { resolution: 'selected', optionIndex: 0, reason: 'It fits what is established.' },
    });
    const proposed = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/truth-proposals`,
      payload: { commandId: crypto.randomUUID(), truthId: truth.id },
    });

    expect(proposed.statusCode).toBe(201);
    expect(proposed.json()).toMatchObject({
      ok: true,
      truthId: truth.id,
      proposal: { targetKind: 'truth', proposal: { resolution: 'selected', optionIndex: 0 } },
    });

    // A provider failure is a 201 outcome the screen renders, not a 5xx — the
    // same contract every other proposal route follows (D-116).
    ai.enqueue({ kind: 'error', errorKind: 'unavailable', message: 'No provider.' });
    const failed = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/truth-proposals`,
      payload: { commandId: crypto.randomUUID(), truthId: truth.id },
    });

    expect(failed.statusCode).toBe(201);
    expect(failed.json()).toMatchObject({ ok: false, errorKind: 'unavailable' });
  });

  it('rejects a truth-proposal body the schema does not accept with 400', async () => {
    const { campaignId } = await moveMade();

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/truth-proposals`,
      payload: { commandId: crypto.randomUUID(), truthId: 'not-an-oracle-id' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('suggests a move for a described action, and a move filled from it names it (7.12, D-135)', async () => {
    const { campaignId, characterId } = await moveMade();
    ai.enqueue({
      kind: 'structured',
      value: {
        moveId: 'move:adventure/gather-information',
        rollOption: 'wits',
        triggerText: 'When you search for clues',
        reason: 'Pulling the logs is looking for clues.',
        confidence: 'high',
      },
    });

    const suggested = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/move-suggestions`,
      payload: {
        commandId: newId(),
        actorCharacterId: characterId,
        actionText: 'Rook pulls the station logs.',
      },
    });
    expect(suggested.statusCode).toBe(201);
    const body = suggested.json();
    expect(body).toMatchObject({
      ok: true,
      suggestion: { moveId: 'move:adventure/gather-information', confidence: 'high' },
    });
    const log = await app.inject({ method: 'GET', url: `/api/campaigns/${campaignId}/log` });
    expect(log.body).not.toContain(body.eventId);

    const invoked = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/moves`,
      payload: {
        commandId: newId(),
        moveId: 'move:adventure/gather-information',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'wits' },
        adds: [],
        actionText: 'Rook pulls the station logs.',
        suggestionEventId: body.eventId,
      },
    });
    expect(invoked.statusCode).toBe(201);
    const move = (await readEvents(db.sql, campaignId)).findLast((e) => e.type === 'move.invoked');
    expect(move?.type === 'move.invoked' && move.payload.suggestionEventId).toBe(body.eventId);

    const empty = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/move-suggestions`,
      payload: { commandId: newId(), actorCharacterId: characterId, actionText: ' ' },
    });
    expect(empty.statusCode).toBe(400);
  });

  it('notes a trigger that does not fit, on the beat in the log (7.13, D-136)', async () => {
    const { campaignId, characterId } = await moveMade();
    const moveCommandId = newId<CommandId>();
    const invoked = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/moves`,
      payload: {
        commandId: moveCommandId,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: characterId,
        using: { using: 'stat', stat: 'wits' },
        adds: [],
        actionText: 'Rook reads the station logs.',
      },
    });
    expect(invoked.statusCode).toBe(201);
    ai.enqueue({
      kind: 'structured',
      value: {
        fits: false,
        triggerText: 'When you attempt something risky',
        reason: 'Reading logs carries no risk.',
        confidence: 'medium',
      },
    });

    const checked = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/trigger-checks`,
      payload: { commandId: newId(), moveCommandId },
    });
    expect(checked.statusCode).toBe(201);
    const body = checked.json();
    expect(body).toMatchObject({ ok: true, fits: false, note: { confidence: 'medium' } });
    const log = await app.inject({ method: 'GET', url: `/api/campaigns/${campaignId}/log` });
    expect(log.body).toContain(body.eventId);

    const again = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/trigger-checks`,
      payload: { commandId: newId(), moveCommandId },
    });
    expect(again.statusCode).toBe(422);
  });

  it('runs the world pass after a committed passage, once (8.1, D-138)', async () => {
    const { campaignId, moveCommandId } = await moveMade();
    const narrated = frames(
      (
        await app.inject({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/narrations`,
          payload: { commandId: newId(), afterCommandId: moveCommandId },
        })
      ).body,
    ).at(-1);
    if (narrated?.type !== 'committed') throw new Error('expected a committed passage');
    ai.enqueue({
      kind: 'structured',
      value: { review: 'Nothing new.', recipes: [], questions: [] },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/world-passes`,
      payload: { commandId: newId(), passageEventId: narrated.eventId },
    });

    expect(response.statusCode).toBe(200);
    expect(frames(response.body).at(-1)?.type).toBe('committed');

    const again = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/world-passes`,
      payload: { commandId: newId(), passageEventId: narrated.eventId },
    });
    expect(again.statusCode).toBe(422);
    expect(again.json()).toMatchObject({ reason: 'already_passed' });
  });

  it('refuses to frame when the session has no scene, before any stream opens (D-141)', async () => {
    const { campaignId } = await moveMade();

    const refused = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/scene-frames`,
      payload: { commandId: newId() },
    });

    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ reason: 'no_scene' });
  });

  it('overrides momentum by hand, and refuses an out-of-range value (A16, D-117)', async () => {
    const { campaignId, characterId } = await moveMade();

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/overrides`,
      payload: {
        commandId: newId(),
        target: { kind: 'momentum', characterId },
        to: 4,
        reason: 'Last session’s ruling left it one too low',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ to: 4 });
    const state = project(await readEvents(db.sql, campaignId));
    expect(state.characters[characterId]?.momentum).toMatchObject({
      value: 4,
      lastChangedBy: { actorKind: 'player', manual: true },
    });

    const refused = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/overrides`,
      payload: {
        commandId: newId(),
        target: { kind: 'meter', characterId, meter: 'health' },
        to: 9,
      },
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ reason: 'out_of_range' });
  });
});
