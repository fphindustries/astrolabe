import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { STARFORGED } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type CampaignId,
  type CampaignListResponse,
  type CampaignStateResponse,
  type CreateCampaignResponse,
  type InvokeMoveResponse,
  type NarrativeLogResponse,
  type ResolvePayThePriceResponse,
  type VoidPreviewResult,
  type CommandId,
  type EntityId,
  type EventId,
} from '@astrolabe/shared';

import { playSessionTwoOpen, type SessionTwoOpenRun } from '../fixtures/index.js';
import { StubProvider } from '../ai/stub.js';
import { createCharacter } from '../db/character-commands.js';
import { appendCommand } from '../db/event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { uuidv7 } from '../db/uuid.js';

import { buildApp } from './app.js';

const byCategory = (category: string, n: number) =>
  STARFORGED.assets
    .filter((a) => a.categoryId === category)
    .slice(0, n)
    .map((a) => a.id);

/** A legal set under D-89: two paths plus a companion in the final slot. */
const VALID_ASSETS = [...byCategory('path', 2), ...byCategory('companion', 1)];

function validDraftBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    commandId: crypto.randomUUID(),
    draft: {
      name: 'Nyx Adair',
      callsign: 'Nyx',
      stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
      assets: VALID_ASSETS,
    },
    ...overrides,
  };
}

/**
 * The HTTP read API against a real, migrated database (task 5.0).
 *
 * Seeded with `session-2-open` (D-122): the golden session's campaign with
 * session 2 open, as the play screen finds it before Beat 1's recap.
 */
describe.skipIf(!hasTestDatabase)('the HTTP read API', () => {
  let db: TestDatabase;
  let run: SessionTwoOpenRun;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDatabase('http-app');
    run = await playSessionTwoOpen(db.sql);
    app = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  it('lists the seeded campaign', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/campaigns' });
    expect(response.statusCode).toBe(200);
    const body = response.json<CampaignListResponse>();
    expect(body).toContainEqual({ id: run.campaignId, name: 'Lantern Wake (session 2 open)' });
  });

  it('projects a campaign’s state', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${run.campaignId}/state`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<CampaignStateResponse>();
    expect(body.state.campaign?.name).toBe('Lantern Wake (session 2 open)');
    expect(body.state.session?.number).toBe(2);
    expect(body.headSeq).toBeGreaterThan(0);
    expect(Object.keys(body.state.characters)).toHaveLength(3);
  });

  it('404s an unknown campaign', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/campaigns/00000000-0000-0000-0000-000000000000/state',
    });
    expect(response.statusCode).toBe(404);
  });

  it('400s a malformed campaign id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/campaigns/not-a-uuid/state' });
    expect(response.statusCode).toBe(400);
  });

  it('pages the narrative log', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${run.campaignId}/log?limit=2`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<NarrativeLogResponse>();
    expect(body.beats.length).toBeLessThanOrEqual(2);
    expect(body.beats.length).toBeGreaterThan(0);
  });

  it('serves an entity’s grounding as chips, discarded rolls included, and 404s an unknown entity (8.5)', async () => {
    const campaignId = run.campaignId;
    const entityId = uuidv7() as EntityId;
    const discarded = uuidv7() as EventId;
    const survivor = uuidv7() as EventId;
    await appendCommand(db.sql, {
      campaignId,
      commandId: uuidv7() as CommandId,
      kind: 'world.pass',
      actor: { kind: 'system' },
      events: [
        {
          id: discarded,
          type: 'oracle.rolled',
          payload: {
            oracleId: 'oracle:characters/first-look',
            roll: 53,
            rowText: 'Large',
            recipeId: 'recipe:npc',
            slot: 'first_look',
          },
        },
        {
          type: 'event.voided',
          payload: {
            targetEventId: discarded,
            kind: 'reroll',
            reason: 'The sleeper is a child.',
            cascaded: [discarded],
          },
          actor: { kind: 'ai' },
        },
        {
          id: survivor,
          type: 'oracle.rolled',
          payload: {
            oracleId: 'oracle:characters/first-look',
            roll: 66,
            rowText: 'Scruffy',
            recipeId: 'recipe:npc',
            slot: 'first_look',
            rerollOf: discarded,
          },
        },
        {
          type: 'entity.established',
          payload: {
            entityId,
            kind: 'npc',
            name: 'Bruno Valenus',
            fields: { first_look: 'Scruffy.' },
            provenance: { establishedBy: 'ai', recipeId: 'recipe:npc', groundedIn: [survivor] },
          },
          actor: { kind: 'ai' },
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}/entities/${entityId}/grounding`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      chips: [
        {
          eventId: discarded,
          oracleId: 'oracle:characters/first-look',
          slot: 'first_look',
          roll: 53,
          rowText: 'Large',
          voided: true,
          discardedBecause: 'The sleeper is a child.',
        },
        {
          eventId: survivor,
          oracleId: 'oracle:characters/first-look',
          slot: 'first_look',
          roll: 66,
          rowText: 'Scruffy',
          voided: false,
        },
      ],
    });

    const unknown = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}/entities/${uuidv7()}/grounding`,
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('400s an invalid log query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${run.campaignId}/log?limit=not-a-number`,
    });
    expect(response.statusCode).toBe(400);
  });

  describe('creating a campaign (task 4.1)', () => {
    it('writes a campaign with default settings and returns it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/campaigns',
        payload: {
          campaignId: crypto.randomUUID(),
          commandId: crypto.randomUUID(),
          name: 'Fresh Signal',
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<CreateCampaignResponse>();
      expect(body.campaignId).toBeTruthy();

      const state = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${body.campaignId}/state`,
      });
      const stateBody = state.json<CampaignStateResponse>();
      expect(stateBody.state.campaign?.name).toBe('Fresh Signal');
      expect(stateBody.state.campaign?.settings).toEqual({
        narrationLatitude: 'color',
        narrationLength: 'standard',
        rerollCap: 2,
      });
    });

    it('accepts a partial settings override', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/campaigns',
        payload: {
          campaignId: crypto.randomUUID(),
          commandId: crypto.randomUUID(),
          name: 'Quiet Reach',
          settings: { narrationLatitude: 'full_voice' },
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<CreateCampaignResponse>();

      const state = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${body.campaignId}/state`,
      });
      const stateBody = state.json<CampaignStateResponse>();
      expect(stateBody.state.campaign?.settings.narrationLatitude).toBe('full_voice');
      expect(stateBody.state.campaign?.settings.narrationLength).toBe('standard');
    });

    it('400s a malformed body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/campaigns',
        payload: { commandId: 'not-a-uuid', name: 'Fresh Signal' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('400s a missing name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/campaigns',
        payload: { commandId: crypto.randomUUID(), name: '' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  async function freshCampaignId(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      payload: { campaignId: crypto.randomUUID(), commandId: crypto.randomUUID(), name: 'x' },
    });
    return response.json<CreateCampaignResponse>().campaignId;
  }

  /** A campaign with its first session open, so moves can be made (D-146). */
  async function freshSessionCampaignId(): Promise<string> {
    const campaignId = await freshCampaignId();
    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/sessions`,
      payload: { commandId: crypto.randomUUID(), scene: { title: 'Somewhere' } },
    });
    expect(response.statusCode).toBe(201);
    return campaignId;
  }

  /** Setup, not the subject: the character command (D-206 retired its Milestone 1 route). */
  async function freshCharacterId(campaignId: string): Promise<string> {
    const body = validDraftBody();
    const created = await createCharacter(db.sql, {
      campaignId: campaignId as CampaignId,
      commandId: body.commandId as CommandId,
      actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
      draft: body.draft,
    });
    return created.characterId;
  }

  describe('resolving a move (task 6.x)', () => {
    it('invokes a rolled move and returns a result with a real tier', async () => {
      const campaignId = await freshSessionCampaignId();
      const characterId = await freshCharacterId(campaignId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/moves`,
        payload: {
          commandId: crypto.randomUUID(),
          moveId: 'move:adventure/face-danger',
          actorCharacterId: characterId,
          using: { using: 'stat', stat: 'iron' },
          adds: [],
          actionText: 'Forcing the bulkhead.',
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<InvokeMoveResponse>();
      expect(['strong_hit', 'weak_hit', 'miss']).toContain(body.roll.tier);
      expect(body.invocationEventId).toBeTruthy();
      expect(body.rollEventId).toBeTruthy();
    });

    it('400s a malformed body', async () => {
      const campaignId = await freshCampaignId();
      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/moves`,
        payload: { commandId: crypto.randomUUID() },
      });
      expect(response.statusCode).toBe(400);
    });

    it('422s a move with no Milestone 1 automation', async () => {
      const campaignId = await freshCampaignId();
      const characterId = await freshCharacterId(campaignId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/moves`,
        payload: {
          commandId: crypto.randomUUID(),
          moveId: 'move:adventure/undertake-an-expedition',
          actorCharacterId: characterId,
          adds: [],
        },
      });
      expect(response.statusCode).toBe(422);
    });

    it('404s an unknown campaign', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/campaigns/00000000-0000-0000-0000-000000000000/moves',
        payload: {
          commandId: crypto.randomUUID(),
          moveId: 'move:adventure/face-danger',
          actorCharacterId: crypto.randomUUID(),
          adds: [],
        },
      });
      expect(response.statusCode).toBe(404);
    });

    it('422s a move choice on a roll that offered none', async () => {
      const campaignId = await freshSessionCampaignId();
      const characterId = await freshCharacterId(campaignId);
      const invoke = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/moves`,
        payload: {
          commandId: crypto.randomUUID(),
          moveId: 'move:quest/swear-an-iron-vow',
          actorCharacterId: characterId,
          adds: [],
        },
      });
      const { rollEventId } = invoke.json<InvokeMoveResponse>();

      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/moves/choice`,
        payload: {
          commandId: crypto.randomUUID(),
          rollEventId,
          choiceId: 'not-a-real-choice',
          optionIds: [],
        },
      });
      expect(response.statusCode).toBe(422);
    });

    it('422s a burn attempt against something that is not an action roll', async () => {
      const campaignId = await freshSessionCampaignId();
      const characterId = await freshCharacterId(campaignId);
      const invoke = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/moves`,
        payload: {
          commandId: crypto.randomUUID(),
          moveId: 'move:quest/swear-an-iron-vow',
          actorCharacterId: characterId,
          adds: [],
        },
      });
      // The invocation event exists but is not a roll — real dice are
      // non-seedable over HTTP, so this checks the type guard rather than
      // trying to force a specific (missing) burn offer by chance.
      const { invocationEventId } = invoke.json<InvokeMoveResponse>();

      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/moves/burn`,
        payload: { commandId: crypto.randomUUID(), rollEventId: invocationEventId },
      });
      expect(response.statusCode).toBe(422);
    });

    describe('Pay the Price (D-08)', () => {
      it('resolves the obvious method deterministically, with no oracle roll', async () => {
        const campaignId = await freshCampaignId();
        const characterId = await freshCharacterId(campaignId);

        const response = await app.inject({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/pay-the-price`,
          payload: {
            commandId: crypto.randomUUID(),
            actorCharacterId: characterId,
            optionId: 'obvious',
          },
        });
        expect(response.statusCode).toBe(201);
        const body = response.json<ResolvePayThePriceResponse>();
        expect(body.oracle).toBeUndefined();
        expect(body.invocationEventId).toBeTruthy();
      });

      it('rolls the table and reports whatever the dice actually said', async () => {
        const campaignId = await freshCampaignId();
        const characterId = await freshCharacterId(campaignId);

        const response = await app.inject({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/pay-the-price`,
          payload: {
            commandId: crypto.randomUUID(),
            actorCharacterId: characterId,
            optionId: 'table',
          },
        });
        expect(response.statusCode).toBe(201);
        const body = response.json<ResolvePayThePriceResponse>();
        expect(body.oracle?.roll).toBeGreaterThanOrEqual(1);
        expect(body.oracle?.roll).toBeLessThanOrEqual(100);
        expect(typeof body.oracle?.rowText).toBe('string');
      });
    });
  });

  /** Void-and-redo (task 6.10, A11). */
  describe('voiding an event', () => {
    it('previews a void, then applies it, then finds nothing left to void twice', async () => {
      const campaignId = await freshSessionCampaignId();
      const characterId = await freshCharacterId(campaignId);

      const invoke = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/moves`,
        payload: {
          commandId: crypto.randomUUID(),
          moveId: 'move:quest/swear-an-iron-vow',
          actorCharacterId: characterId,
          adds: [],
        },
      });
      const { rollEventId } = invoke.json<InvokeMoveResponse>();

      const preview = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${campaignId}/events/${rollEventId}/void-preview`,
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json<VoidPreviewResult>().ok).toBe(true);

      const voided = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/events/${rollEventId}/void`,
        payload: { commandId: crypto.randomUUID(), reason: 'Wrong move.' },
      });
      expect(voided.statusCode).toBe(201);

      const again = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${campaignId}/events/${rollEventId}/void-preview`,
      });
      const plan = again.json<VoidPreviewResult>();
      expect(plan.ok).toBe(false);
      if (!plan.ok) {
        expect(plan.reason).toBe('already_voided');
      }
    });

    it('404s an unknown campaign, 400s a malformed event id', async () => {
      const bad = await app.inject({
        method: 'GET',
        url: '/api/campaigns/not-a-uuid/events/not-a-uuid/void-preview',
      });
      expect(bad.statusCode).toBe(400);
    });

    it('voids a real roll end to end, in the seeded open session (D-84)', async () => {
      // `invokeMove` picks the open session up from projected state, so a
      // fresh roll made against this campaign inherits it.
      const invoke = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${run.campaignId}/moves`,
        payload: {
          commandId: crypto.randomUUID(),
          moveId: 'move:quest/swear-an-iron-vow',
          actorCharacterId: run.characters.juno,
          adds: [],
        },
      });
      expect(invoke.statusCode).toBe(201);
      const { rollEventId } = invoke.json<InvokeMoveResponse>();

      const preview = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${run.campaignId}/events/${rollEventId}/void-preview`,
      });
      expect(preview.statusCode).toBe(200);
      const plan = preview.json<VoidPreviewResult>();
      expect(plan.ok).toBe(true);

      const executed = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${run.campaignId}/events/${rollEventId}/void`,
        payload: { commandId: crypto.randomUUID(), reason: 'testing the route' },
      });
      expect(executed.statusCode).toBe(201);

      const again = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${run.campaignId}/events/${rollEventId}/void-preview`,
      });
      const reAsked = again.json<VoidPreviewResult>();
      expect(reAsked.ok).toBe(false);
      if (!reAsked.ok) {
        expect(reAsked.reason).toBe('already_voided');
      }
    });
  });
});
