import { STARFORGED, type CharacterId, type MoveId } from '@astrolabe/rules';
import {
  LOCAL_PLAYER_ID,
  type AstrolabeEvent,
  type CampaignState,
  type CommandId,
} from '@astrolabe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { project } from '../projection/project.js';
import { readEvents } from '../db/event-store.js';
import { migrate } from '../db/migrate.js';
import { invokeMove } from '../db/move-commands.js';
import { resetSchema, summariseCampaigns } from '../db/reset.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { uuidv7 } from '../db/uuid.js';

import { fixtureUuid } from './ids.js';
import {
  seedFixture,
  SESSION_ONE,
  SESSION_ONE_CAMPAIGN_ID,
  SESSION_TWO_OPEN,
  SESSION_TWO_OPEN_CAMPAIGN_ID,
} from './index.js';
import { actionRoll, loadedDice } from './loaded-dice.js';

/** Whatever a replay can't reproduce — minted ids, timestamps — left out. */
function crewByCallsign(state: CampaignState) {
  return Object.fromEntries(
    Object.values(state.characters).map((c) => [
      c.callsign,
      {
        momentum: c.momentum.value,
        health: c.meters.health.value,
        spirit: c.meters.spirit.value,
        supply: c.meters.supply.value,
        stats: c.stats,
        assets: c.assets,
        pronouns: c.pronouns,
      },
    ]),
  );
}

const shape = (events: readonly AstrolabeEvent[]) =>
  events.map((e) => `${e.type}${e.type === 'narration.written' ? `:${e.payload.text}` : ''}`);

describe('fixture ids and loaded dice (D-122)', () => {
  it('derives the same uuid for the same fixture and key, and a different one otherwise', () => {
    const a = fixtureUuid(SESSION_ONE, 'campaign');
    expect(a).toBe(fixtureUuid(SESSION_ONE, 'campaign'));
    expect(a).not.toBe(fixtureUuid(SESSION_ONE, 'other'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('lands each die on its scripted face and refuses to read past the script', () => {
    const dice = actionRoll(6, [1, 10]);
    expect(Math.floor(dice.next() * 6) + 1).toBe(6);
    expect(Math.floor(dice.next() * 10) + 1).toBe(1);
    expect(Math.floor(dice.next() * 10) + 1).toBe(10);
    expect(dice.remaining).toBe(0);
    expect(() => dice.next()).toThrow(/ran out/);
    expect(() => loadedDice([{ sides: 6, face: 7 }])).toThrow();
  });
});

describe.skipIf(!hasTestDatabase)('the session-1 fixture (D-72, D-122)', () => {
  let db: TestDatabase;
  let replay: TestDatabase;
  let events: readonly AstrolabeEvent[];
  let state: CampaignState;

  beforeAll(async () => {
    db = await createTestDatabase('fixture');
    replay = await createTestDatabase('fixture_replay');
    expect(await seedFixture(db.sql, SESSION_ONE)).toBe('seeded');
    events = await readEvents(db.sql, SESSION_ONE_CAMPAIGN_ID);
    state = project(events);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
    await replay?.close();
  });

  it('lands where the golden session’s Setup begins', () => {
    expect(state.campaign).toMatchObject({
      id: SESSION_ONE_CAMPAIGN_ID,
      name: 'Lantern Wake',
      settings: { narrationLatitude: 'color' },
    });
    const crew = crewByCallsign(state);
    expect({
      vesna: crew['Vesna']?.momentum,
      rook: crew['Rook']?.momentum,
      juno: crew['Juno']?.momentum,
    }).toEqual({
      vesna: 7,
      rook: 2,
      juno: 3,
    });
    // D-131: Beat 5's "her" for Vesna; Rook's and Juno's are never given.
    expect([crew['Vesna']?.pronouns, crew['Rook']?.pronouns, crew['Juno']?.pronouns]).toEqual([
      'she/her',
      null,
      null,
    ]);
    expect(Object.values(state.tracks)).toContainEqual(
      expect.objectContaining({
        kind: 'vow',
        rank: 'formidable',
        title: "Recover the flight recorder of Meridian's Hope",
      }),
    );
    expect(
      Object.values(state.entities)
        .filter((e) => e.kind === 'location')
        .map((e) => e.name),
    ).toEqual(['Deepwater Anchorage', 'Kessel Drift', 'Varga Relay']);
    expect(Object.keys(state.truths)).toHaveLength(3);
  });

  it('ends session 1 with a summary and open threads for the next recap', () => {
    expect(state.session).toMatchObject({ number: 1 });
    expect(state.session?.endedAt).toBeDefined();
    expect(state.canon.sessionSummaries).toEqual([
      expect.objectContaining({
        number: 1,
        openThreads: expect.arrayContaining([expect.any(String)]),
      }),
    ]);
  });

  it('narrates every move beat through the real narration command', () => {
    const moves = events.filter((e) => e.type === 'move.invoked');
    const passages = events.filter((e) => e.type === 'narration.written');
    expect(moves).toHaveLength(4);
    expect(passages).toHaveLength(4);
    expect(events.filter((e) => e.type === 'ai.completed')).toHaveLength(4);
  });

  it('uses only move ids the rules data defines', () => {
    const known = new Set(Object.values(STARFORGED.moves).map((m) => m.id));
    for (const event of events) {
      if (event.type === 'move.invoked') {
        expect(known.has(event.payload.moveId)).toBe(true);
      }
    }
  });

  it('is recognised as already present on a second seed', async () => {
    expect(await seedFixture(db.sql, SESSION_ONE)).toBe('already_present');
    expect(await readEvents(db.sql, SESSION_ONE_CAMPAIGN_ID)).toHaveLength(events.length);
  });

  it('replays to the same campaign in a fresh schema', async () => {
    expect(await seedFixture(replay.sql, SESSION_ONE)).toBe('seeded');
    const again = await readEvents(replay.sql, SESSION_ONE_CAMPAIGN_ID);
    expect(shape(again)).toEqual(shape(events));
    expect(crewByCallsign(project(again))).toEqual(crewByCallsign(state));
  });

  it('resets by dropping and recreating the schema, never by deleting events', async () => {
    await expect(db.sql`delete from events`).rejects.toThrow(/append-only/);

    expect(await resetSchema(db.sql)).toBe(db.schema);
    expect(await summariseCampaigns(db.sql)).toEqual([]);

    await migrate(db.sql);
    expect(await seedFixture(db.sql, SESSION_ONE)).toBe('seeded');
    expect(await summariseCampaigns(db.sql)).toEqual([
      { id: SESSION_ONE_CAMPAIGN_ID, name: 'Lantern Wake', events: events.length },
    ]);
  }, 60_000);
});

describe.skipIf(!hasTestDatabase)('the session-2-open fixture (D-122)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('fixture_open');
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('sits beside session-1 and leaves session 2 open for play', async () => {
    expect(await seedFixture(db.sql, SESSION_ONE)).toBe('seeded');
    expect(await seedFixture(db.sql, SESSION_TWO_OPEN)).toBe('seeded');
    expect((await summariseCampaigns(db.sql)).map((c) => c.id)).toEqual([
      SESSION_ONE_CAMPAIGN_ID,
      SESSION_TWO_OPEN_CAMPAIGN_ID,
    ]);

    const state = project(await readEvents(db.sql, SESSION_TWO_OPEN_CAMPAIGN_ID));
    expect(state.session).toMatchObject({ number: 2 });
    expect(state.session?.endedAt).toBeUndefined();
    expect(state.canon.sessionSummaries).toHaveLength(1);
    const relay = Object.values(state.entities).find((e) => e.name === 'Varga Relay');
    expect(state.scene).toMatchObject({
      title: 'The derelict relay station',
      locationId: relay?.id,
    });
  }, 60_000);

  it('takes a real move into session 2, not the ended session 1', async () => {
    const state = project(await readEvents(db.sql, SESSION_TWO_OPEN_CAMPAIGN_ID));
    const juno = Object.values(state.characters).find((c) => c.callsign === 'Juno');
    const invoked = await invokeMove(db.sql, {
      campaignId: SESSION_TWO_OPEN_CAMPAIGN_ID,
      commandId: uuidv7() as CommandId,
      actor: { kind: 'player', playerId: LOCAL_PLAYER_ID },
      moveId: 'move:adventure/gather-information' as MoveId,
      actorCharacterId: juno?.id as CharacterId,
      using: { using: 'stat', stat: 'wits' },
      adds: [],
      rng: actionRoll(3, [6, 3]),
    });
    expect(invoked.roll.tier).toBe('weak_hit');
    const events = await readEvents(db.sql, SESSION_TWO_OPEN_CAMPAIGN_ID);
    const move = events.find((e) => e.id === invoked.invocationEventId);
    expect(move?.sessionId).toBe(state.session?.id);
  });
});
