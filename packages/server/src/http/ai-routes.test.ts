import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createSeededRandomSource, type CharacterId, type MoveId } from '@astrolabe/rules';
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
    app = buildApp({ sql: db.sql, ai });
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
    ai.enqueue({ kind: 'text', text: 'The logs spill across Juno’s screen in broken fragments.' });

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
    ai.enqueue({ kind: 'text', text: 'Juno frowns, shaken.' });
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
      value: { amount: -1, reason: 'A glancing blow off the armour.' },
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
      reason: 'A glancing blow off the armour.',
    });
  });

  it('proposes a character from a concept, and accepting it keeps the hooks (3.3, D-124)', async () => {
    const { campaignId } = await moveMade();
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
      },
    });
    const proposalCommandId = newId<CommandId>();

    const proposed = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/character-proposals`,
      payload: { commandId: proposalCommandId, concept: 'A pilot who answers every call.' },
    });
    expect(proposed.statusCode).toBe(201);
    const body = proposed.json();
    expect(body).toMatchObject({ ok: true, proposal: { callsign: { value: 'Lantern' } } });
    expect(body.rolls).toHaveLength(5);
    // A session is open here, but a proposal is not a beat of it.
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
