import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JUNO, SESSION_ID, SURVIVOR } from '@astrolabe/shared/test-fixtures';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { project } from '../projection/project.js';
import { buildNarrativeLog } from '../projection/narrative-log.js';

import { appendCommand, readEvents, readNarrativeEvents } from './event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';
import { VoidRefusedError, previewVoid, voidEvent } from './void-command.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const AI: Actor = { kind: 'ai' };

const newId = <T>(): T => uuidv7() as T;

describe.skipIf(!hasTestDatabase)('voiding an event end to end (A11, Beat 7)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('void');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  /**
   * Beat 7 up to the mistake: a campaign, Rook, a session, and the +edge
   * roll that should have been +iron — invocation, roll and effects in one
   * command, with the AI's narration caused by it in another.
   */
  async function beatSeven() {
    const campaignId = newId<CampaignId>();
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
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
        {
          type: 'character.created',
          payload: {
            characterId: JUNO,
            name: 'Rook Ilari',
            callsign: 'Rook',
            stats: { edge: 2, heart: 2, iron: 3, shadow: 1, wits: 1 },
            meters: {
              health: { value: 5, min: 0, max: 5 },
              spirit: { value: 5, min: 0, max: 5 },
              supply: { value: 5, min: 0, max: 5 },
            },
            momentum: 2,
            assets: [],
          },
        },
      ],
    });

    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'session.begin',
      actor: PLAYER,
      events: [{ type: 'session.began', payload: { sessionId: SESSION_ID, number: 2 } }],
    });

    const move = await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'move',
      actor: PLAYER,
      events: [
        {
          type: 'move.invoked',
          payload: {
            moveId: 'move:adventure/face_danger',
            actorCharacterId: JUNO,
            using: { using: 'stat', stat: 'edge' },
            adds: [{ amount: 2, label: 'edge' }],
            actionText: 'Rook forces the sealed bulkhead.',
          },
          sessionId: SESSION_ID,
        },
        {
          type: 'dice.rolled',
          payload: {
            kind: 'action',
            actionDie: 6,
            adds: [{ amount: 2, label: 'edge' }],
            actionScore: 8,
            challengeDice: [3, 4],
            tier: 'strong_hit',
            isMatch: false,
            rng: { source: 'crypto' },
          },
          sessionId: SESSION_ID,
          actor: { kind: 'system' },
        },
        {
          type: 'state.changed',
          payload: {
            cause: {
              kind: 'move_outcome',
              moveId: 'move:adventure/face_danger',
              tier: 'strong_hit',
            },
            changes: [
              { delta: { kind: 'momentum', characterId: JUNO, delta: 1 }, clause: '+1 momentum' },
            ],
          },
          sessionId: SESSION_ID,
          actor: { kind: 'system' },
        },
      ],
    });

    const roll = move.events[1];
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'narrate',
      actor: AI,
      causedBy: roll?.id ?? null,
      events: [
        {
          type: 'narration.written',
          payload: { role: 'beat', text: 'Rook slips past the bulkhead.', groundedIn: [] },
          sessionId: SESSION_ID,
        },
      ],
    });

    return { campaignId, rollId: roll?.id };
  }

  it('previews the whole causal subtree without writing anything', async () => {
    const { campaignId, rollId } = await beatSeven();
    const before = await readEvents(db.sql, campaignId);

    const plan = await previewVoid(db.sql, campaignId, rollId as never);
    if (!plan.ok) throw new Error(`refused: ${plan.detail}`);

    // The move's three events plus the narration caused by it.
    expect(plan.cascaded).toHaveLength(4);
    expect(plan.commands).toHaveLength(2);
    expect(await readEvents(db.sql, campaignId)).toHaveLength(before.length);
  });

  it('writes the cascade onto the void event, and reprojects', async () => {
    const { campaignId, rollId } = await beatSeven();
    const beforeVoid = project(await readEvents(db.sql, campaignId));
    expect(beforeVoid.characters[JUNO]?.momentum.value).toBe(3);

    await voidEvent(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      targetEventId: rollId as never,
      reason: 'Rook is forcing the bulkhead, not slipping past it',
    });

    const events = await readEvents(db.sql, campaignId);
    const voided = events.find((e) => e.type === 'event.voided');
    if (voided?.type !== 'event.voided') throw new Error('expected a void');

    // The cascade is stored, not recomputed at read time.
    expect(voided.payload.cascaded).toHaveLength(4);
    // Momentum is back where it was before the beat.
    expect(project(events).characters[JUNO]?.momentum.value).toBe(2);
  });

  it('keeps the voided roll visible in the log, struck through (D-27)', async () => {
    const { campaignId, rollId } = await beatSeven();
    await voidEvent(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      targetEventId: rollId as never,
      reason: 'wrong stat',
    });

    const page = buildNarrativeLog(
      await readNarrativeEvents(db.sql, campaignId, { sessionId: SESSION_ID }),
    );
    const entry = page.beats.flatMap((b) => b.entries).find((e) => e.event.id === rollId);

    expect(entry).toBeDefined();
    expect(entry?.voided).toBe(true);
    expect(entry?.voidedBy[0]?.reason).toBe('wrong stat');
  });

  it('supports the redo: a new roll after the void stands alone', async () => {
    const { campaignId, rollId } = await beatSeven();
    await voidEvent(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      targetEventId: rollId as never,
      reason: 'wrong stat',
    });

    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'move',
      actor: PLAYER,
      events: [
        {
          type: 'move.invoked',
          payload: {
            moveId: 'move:adventure/face_danger',
            actorCharacterId: JUNO,
            using: { using: 'stat', stat: 'iron' },
            adds: [{ amount: 3, label: 'iron' }],
          },
          sessionId: SESSION_ID,
        },
        {
          type: 'dice.rolled',
          payload: {
            kind: 'action',
            actionDie: 2,
            adds: [{ amount: 3, label: 'iron' }],
            actionScore: 5,
            challengeDice: [8, 4],
            tier: 'miss',
            isMatch: false,
            rng: { source: 'crypto' },
          },
          sessionId: SESSION_ID,
          actor: { kind: 'system' },
        },
      ],
    });

    const events = await readEvents(db.sql, campaignId);
    // Both rolls are in the log, in seq order.
    const rolls = events.filter((e) => e.type === 'dice.rolled');
    expect(rolls).toHaveLength(2);
    // Only the redone one counts: no +1 momentum from the voided strong hit.
    expect(project(events).characters[JUNO]?.momentum.value).toBe(2);
  });

  it('refuses a void that would orphan something, and writes nothing', async () => {
    const { campaignId } = await beatSeven();
    const established = await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'establish',
      actor: AI,
      events: [
        {
          type: 'entity.established',
          payload: {
            entityId: SURVIVOR,
            kind: 'npc',
            name: 'Sura Vance',
            fields: { disposition: 'wary' },
            provenance: { establishedBy: 'ai', groundedIn: [] },
          },
          sessionId: SESSION_ID,
        },
      ],
    });
    await appendCommand(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      kind: 'scene',
      actor: AI,
      events: [
        {
          type: 'scene.started',
          payload: {
            sceneId: newId(),
            title: 'With the survivor',
            locationId: SURVIVOR,
          },
          sessionId: SESSION_ID,
        },
      ],
    });

    const before = await readEvents(db.sql, campaignId);
    await expect(
      voidEvent(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetEventId: established.events[0]?.id as never,
        reason: 'she should not exist',
      }),
    ).rejects.toThrow(VoidRefusedError);

    expect(await readEvents(db.sql, campaignId)).toHaveLength(before.length);
  });

  it('carries the refusal reason on the error, for the UI to show', async () => {
    const { campaignId } = await beatSeven();
    const events = await readEvents(db.sql, campaignId);
    const setup = events.find((e) => e.type === 'campaign.created');

    try {
      await voidEvent(db.sql, {
        campaignId,
        commandId: newId<CommandId>(),
        actor: PLAYER,
        targetEventId: setup?.id as never,
        reason: 'undo the campaign',
      });
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(VoidRefusedError);
      expect((error as VoidRefusedError).plan.reason).toBe('outside_current_session');
    }
  });

  it('is idempotent: the same void command twice writes once', async () => {
    const { campaignId, rollId } = await beatSeven();
    const commandId = newId<CommandId>();
    const request = {
      campaignId,
      commandId,
      actor: PLAYER,
      targetEventId: rollId as never,
      reason: 'wrong stat',
    };

    const first = await voidEvent(db.sql, request);
    expect(first.replayed).toBe(false);

    // A retry hits the already-voided refusal before it reaches the store,
    // which is the honest answer: the void has happened.
    await expect(voidEvent(db.sql, request)).rejects.toThrow(VoidRefusedError);

    const voids = (await readEvents(db.sql, campaignId)).filter((e) => e.type === 'event.voided');
    expect(voids).toHaveLength(1);
  });
});
