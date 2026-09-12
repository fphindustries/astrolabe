import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CAMPAIGN_ID, JUNO, SESSION_ID, VESNA } from '@astrolabe/shared/test-fixtures';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { project } from '../projection/project.js';

import { appendCommand, readEvents, readEventsByCommand, type NewEvent } from './event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const AI: Actor = { kind: 'ai' };

function commandId(): CommandId {
  return uuidv7() as CommandId;
}

function campaignId(): CampaignId {
  return uuidv7() as CampaignId;
}

describe('uuidv7', () => {
  it('is a well-formed v7 uuid', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('sorts by creation time, which is the point of v7 over v4', () => {
    const early = uuidv7(1_000_000_000_000);
    const late = uuidv7(1_700_000_000_000);
    expect(early < late).toBe(true);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });
});

describe.skipIf(!hasTestDatabase)('the event writer', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('store');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  /** A campaign with its first command already written. */
  async function newCampaign(): Promise<CampaignId> {
    const id = campaignId();
    await appendCommand(db.sql, {
      campaignId: id,
      commandId: commandId(),
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
    return id;
  }

  const beginSession: NewEvent = {
    type: 'session.began',
    payload: { sessionId: SESSION_ID, number: 2 },
  };

  describe('sequence assignment', () => {
    it('starts at 1 and assigns consecutive seqs within a command', async () => {
      const id = await newCampaign();
      const result = await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'session.begin',
        actor: PLAYER,
        events: [
          beginSession,
          {
            type: 'narration.written',
            payload: { role: 'recap', text: 'Previously…', groundedIn: [] },
            actor: AI,
          },
        ],
      });

      expect(result.events.map((e) => e.seq)).toEqual([2, 3]);
      expect(result.replayed).toBe(false);
    });

    it('is gapless across commands', async () => {
      const id = await newCampaign();
      await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'a',
        actor: PLAYER,
        events: [beginSession],
      });
      await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'b',
        actor: PLAYER,
        events: [beginSession, beginSession],
      });

      const events = await readEvents(db.sql, id);
      expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    });

    it('leaves no gap when a command fails', async () => {
      const id = await newCampaign();
      // A payload that will not validate: the write throws before any insert.
      await expect(
        appendCommand(db.sql, {
          campaignId: id,
          commandId: commandId(),
          kind: 'bad',
          actor: PLAYER,
          events: [{ type: 'session.began', payload: { sessionId: 'not-a-uuid' } as never }],
        }),
      ).rejects.toThrow();

      const after = await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'good',
        actor: PLAYER,
        events: [beginSession],
      });
      expect(after.events[0]?.seq).toBe(2);
    });

    it('keeps sequences independent per campaign', async () => {
      const a = await newCampaign();
      const b = await newCampaign();
      const inA = await appendCommand(db.sql, {
        campaignId: a,
        commandId: commandId(),
        kind: 'x',
        actor: PLAYER,
        events: [beginSession],
      });
      const inB = await appendCommand(db.sql, {
        campaignId: b,
        commandId: commandId(),
        kind: 'x',
        actor: PLAYER,
        events: [beginSession],
      });
      expect(inA.events[0]?.seq).toBe(2);
      expect(inB.events[0]?.seq).toBe(2);
    });

    it('assigns gapless seqs under concurrent writes to one campaign', async () => {
      const id = await newCampaign();
      const writes = Array.from({ length: 12 }, () =>
        appendCommand(db.sql, {
          campaignId: id,
          commandId: commandId(),
          kind: 'concurrent',
          actor: PLAYER,
          events: [beginSession],
        }),
      );
      await Promise.all(writes);

      const events = await readEvents(db.sql, id);
      expect(events.map((e) => e.seq)).toEqual([...Array(13).keys()].map((n) => n + 1));
    });
  });

  describe('idempotency', () => {
    it('writes nothing on a retry and returns the stored response', async () => {
      const id = await newCampaign();
      const cmd = commandId();
      const request = {
        campaignId: id,
        commandId: cmd,
        kind: 'session.begin',
        actor: PLAYER,
        response: { sessionNumber: 2 },
        events: [beginSession],
      };

      const first = await appendCommand(db.sql, request);
      const retry = await appendCommand(db.sql, request);

      expect(first.replayed).toBe(false);
      expect(retry.replayed).toBe(true);
      expect(retry.response).toEqual({ sessionNumber: 2 });
      // The same events come back, and no new ones were written.
      expect(retry.events.map((e) => e.id)).toEqual(first.events.map((e) => e.id));
      expect(await readEvents(db.sql, id)).toHaveLength(2);
    });

    it('does not consume a sequence number on a retry', async () => {
      const id = await newCampaign();
      const cmd = commandId();
      const request = {
        campaignId: id,
        commandId: cmd,
        kind: 'x',
        actor: PLAYER,
        events: [beginSession],
      };

      await appendCommand(db.sql, request);
      await appendCommand(db.sql, request);
      const next = await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'y',
        actor: PLAYER,
        events: [beginSession],
      });
      expect(next.events[0]?.seq).toBe(3);
    });

    it('resolves two identical concurrent requests to one write', async () => {
      const id = await newCampaign();
      const cmd = commandId();
      const request = {
        campaignId: id,
        commandId: cmd,
        kind: 'x',
        actor: PLAYER,
        response: { ok: true },
        events: [beginSession],
      };

      const [a, b] = await Promise.all([
        appendCommand(db.sql, request),
        appendCommand(db.sql, request),
      ]);

      expect([a?.replayed, b?.replayed].sort()).toEqual([false, true]);
      expect(await readEvents(db.sql, id)).toHaveLength(2);
    });
  });

  describe('the envelope the store assigns', () => {
    it('stamps a command id shared by every event it wrote', async () => {
      const id = await newCampaign();
      const cmd = commandId();
      const result = await appendCommand(db.sql, {
        campaignId: id,
        commandId: cmd,
        kind: 'x',
        actor: PLAYER,
        events: [beginSession, beginSession],
      });
      expect(result.events.every((e) => e.commandId === cmd)).toBe(true);
      expect(await readEventsByCommand(db.sql, id, cmd)).toHaveLength(2);
    });

    it('applies the command causality to every event it wrote', async () => {
      const id = await newCampaign();
      const cause = (await readEvents(db.sql, id))[0];
      const result = await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'narrate',
        actor: AI,
        causedBy: cause?.id ?? null,
        events: [
          { type: 'narration.written', payload: { role: 'beat', text: 'A beat.', groundedIn: [] } },
        ],
      });
      expect(result.events[0]?.causedBy).toBe(cause?.id);
    });

    it('gives every event a distinct id sharing the command timestamp', async () => {
      // v7 orders across milliseconds, not within one: events written in the
      // same millisecond share the 48-bit timestamp prefix and differ only
      // in randomness. Nothing depends on ordering them by id — readers
      // order by `seq`, never by id or timestamp — so the guarantee that
      // matters here is distinctness.
      const id = await newCampaign();
      const result = await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'x',
        actor: PLAYER,
        events: [beginSession, beginSession, beginSession],
      });
      const ids = result.events.map((e) => e.id);
      expect(new Set(ids).size).toBe(3);
      expect(new Set(ids.map((i) => i.slice(0, 8))).size).toBe(1);
      // Order comes from seq, and that is monotonic.
      expect(result.events.map((e) => e.seq)).toEqual([2, 3, 4]);
    });

    it('defaults an event actor to the command actor, and lets one override', async () => {
      const id = await newCampaign();
      const result = await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'x',
        actor: PLAYER,
        events: [
          beginSession,
          {
            type: 'narration.written',
            payload: { role: 'recap', text: 'x', groundedIn: [] },
            actor: AI,
          },
        ],
      });
      expect(result.events[0]?.actor.kind).toBe('player');
      expect(result.events[1]?.actor.kind).toBe('ai');
    });

    it('stamps one occurredAt for the whole command', async () => {
      const id = await newCampaign();
      const result = await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'x',
        actor: PLAYER,
        events: [beginSession, beginSession],
      });
      expect(result.events[0]?.occurredAt).toBe(result.events[1]?.occurredAt);
    });

    it('refuses a command that writes nothing', async () => {
      const id = await newCampaign();
      await expect(
        appendCommand(db.sql, {
          campaignId: id,
          commandId: commandId(),
          kind: 'x',
          actor: PLAYER,
          events: [],
        }),
      ).rejects.toThrow(/at least one event/);
    });

    it('refuses to write to a campaign that does not exist', async () => {
      await expect(
        appendCommand(db.sql, {
          campaignId: campaignId(),
          commandId: commandId(),
          kind: 'x',
          actor: PLAYER,
          events: [beginSession],
        }),
      ).rejects.toThrow();
    });
  });

  describe('the read path', () => {
    it('round-trips every envelope field through Postgres', async () => {
      const id = await newCampaign();
      const written = await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'x',
        actor: PLAYER,
        events: [
          {
            type: 'move.invoked',
            payload: {
              moveId: 'move:adventure/face_danger',
              actorCharacterId: VESNA,
              using: { using: 'stat', stat: 'iron' },
              adds: [{ amount: 2, label: 'iron' }],
              actionText: 'Rook forces the sealed bulkhead.',
            },
            sessionId: SESSION_ID,
            subjectCharacterId: VESNA,
          },
        ],
      });

      const read = await readEvents(db.sql, id);
      expect(read[1]).toEqual(written.events[0]);
    });

    it('returns occurredAt as an ISO string, not a Date', async () => {
      // The projector is banned from touching Date; a timestamptz comes back
      // from the driver as one, and toTimestamp is where that is undone.
      const id = await newCampaign();
      const [event] = await readEvents(db.sql, id);
      expect(typeof event?.occurredAt).toBe('string');
      expect(event?.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('does not camel-case keys inside the payload', async () => {
      // The driver's camel transform would rewrite payload keys too, which
      // is why columns are mapped by hand.
      const id = await newCampaign();
      const [event] = await readEvents(db.sql, id);
      if (event?.type !== 'campaign.created') throw new Error('expected campaign.created');
      expect(event.payload.settings.narrationLatitude).toBe('color');
    });

    it('returns events in sequence order, never by timestamp', async () => {
      const id = await newCampaign();
      for (let i = 0; i < 5; i += 1) {
        await appendCommand(db.sql, {
          campaignId: id,
          commandId: commandId(),
          kind: 'x',
          actor: PLAYER,
          events: [beginSession],
        });
      }
      const events = await readEvents(db.sql, id);
      expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('reads back only the campaign asked for', async () => {
      const a = await newCampaign();
      const b = await newCampaign();
      await appendCommand(db.sql, {
        campaignId: b,
        commandId: commandId(),
        kind: 'x',
        actor: PLAYER,
        events: [beginSession],
      });
      expect(await readEvents(db.sql, a)).toHaveLength(1);
      expect(await readEvents(db.sql, b)).toHaveLength(2);
    });
  });

  describe('written log projects to the expected state', () => {
    it('feeds the projector end to end', async () => {
      const id = await newCampaign();
      await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'session.begin',
        actor: PLAYER,
        events: [
          beginSession,
          {
            type: 'character.created',
            payload: {
              characterId: JUNO,
              name: 'Juno Marr',
              callsign: 'Juno',
              stats: { edge: 1, heart: 2, iron: 1, shadow: 2, wits: 3 },
              meters: {
                health: { value: 5, min: 0, max: 5 },
                spirit: { value: 5, min: 0, max: 5 },
                supply: { value: 5, min: 0, max: 5 },
              },
              momentum: 3,
              assets: [],
            },
          },
        ],
      });
      await appendCommand(db.sql, {
        campaignId: id,
        commandId: commandId(),
        kind: 'move',
        actor: PLAYER,
        events: [
          {
            type: 'state.changed',
            payload: {
              cause: {
                kind: 'move_outcome',
                moveId: 'move:adventure/gather_information',
                tier: 'weak_hit',
              },
              changes: [
                {
                  delta: { kind: 'momentum', characterId: JUNO, delta: 1 },
                  clause: '+1 momentum',
                },
              ],
            },
            actor: { kind: 'system' },
          },
        ],
      });

      const state = project(await readEvents(db.sql, id));
      expect(state.campaign?.name).toBe('Lantern Wake');
      expect(state.session?.number).toBe(2);
      expect(state.characters[JUNO]?.momentum.value).toBe(4);
      expect(state.characters[JUNO]?.momentum.max).toBe(10);
    });
  });
});

describe('CAMPAIGN_ID fixture', () => {
  it('is a uuid the store would accept', () => {
    expect(CAMPAIGN_ID).toMatch(/^[0-9a-f-]{36}$/);
  });
});
