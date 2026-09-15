import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type NarrativeLogResponse,
} from '@astrolabe/shared';

import { describeRecap, previousSession } from '../ai/context/index.js';
import type { TextSink } from '../ai/respond.js';
import { StubProvider, type StubResponse } from '../ai/stub.js';
import {
  SESSION_ONE,
  SESSION_ONE_CAMPAIGN_ID,
  actionRoll,
  seedFixture,
} from '../fixtures/index.js';
import { buildApp } from '../http/app.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { readEvents } from './event-store.js';
import { invokeMove, MoveRejectedError } from './move-commands.js';
import { beginSession, prepareRecap, runRecap } from './session-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>(): T => uuidv7() as T;
const SINK: TextSink = { delta: () => {}, reset: () => {} };

function segments(
  ...list: readonly [about: string, character: string | null, basis: string[], text: string][]
): StubResponse {
  return {
    kind: 'structured',
    value: {
      segments: list.map(([about, character, basis, text]) => ({ about, character, basis, text })),
    },
  };
}

describe.skipIf(!hasTestDatabase)('the session lifecycle (group 9, D-146, D-147)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('sessions');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  describe('Begin a Session (9.1, D-146)', () => {
    it("opens a campaign's first session on the scene the player names, and refuses a second while it is open", async () => {
      const campaignId = newId<CampaignId>();
      await createCampaign(db.sql, { campaignId, commandId: newId(), actor: PLAYER, name: 'x' });

      await expect(
        beginSession(db.sql, { campaignId, commandId: newId(), actor: PLAYER }),
      ).rejects.toMatchObject({ reason: 'scene_required' });

      const commandId = newId<CommandId>();
      const begun = await beginSession(db.sql, {
        campaignId,
        commandId,
        actor: PLAYER,
        scene: { title: '  A quiet dock  ' },
      });
      expect(begun).toMatchObject({ number: 1, recap: false });

      const events = await readEvents(db.sql, campaignId);
      const state = project(events);
      expect(state.session).toMatchObject({ id: begun.sessionId, number: 1 });
      expect(state.scene).toMatchObject({ id: begun.sceneId, title: 'A quiet dock' });
      expect(events.filter((e) => e.commandId === commandId).map((e) => e.sessionId)).toEqual([
        begun.sessionId,
        begun.sessionId,
      ]);

      // A replay answers the same session.
      expect(await beginSession(db.sql, { campaignId, commandId, actor: PLAYER })).toEqual(begun);

      await expect(
        beginSession(db.sql, { campaignId, commandId: newId(), actor: PLAYER }),
      ).rejects.toMatchObject({ reason: 'session_open' });
    });

    it('carries the last scene forward into a new, unframed scene, and takes no scene of its own', async () => {
      const db2 = await createTestDatabase('sessions_carry');
      try {
        await seedFixture(db2.sql, SESSION_ONE);
        const campaignId = SESSION_ONE_CAMPAIGN_ID;
        const before = project(await readEvents(db2.sql, campaignId));
        expect(before.scene?.title).toBe('The derelict relay station');

        await expect(
          beginSession(db2.sql, {
            campaignId,
            commandId: newId(),
            actor: PLAYER,
            scene: { title: 'Elsewhere' },
          }),
        ).rejects.toMatchObject({ reason: 'scene_carried' });

        const begun = await beginSession(db2.sql, {
          campaignId,
          commandId: newId(),
          actor: PLAYER,
        });
        expect(begun).toMatchObject({ number: 2, recap: true });

        const after = project(await readEvents(db2.sql, campaignId));
        expect(after.session).toMatchObject({ id: begun.sessionId, number: 2 });
        expect(after.session?.endedAt).toBeUndefined();
        expect(after.scene).toEqual({
          id: begun.sceneId,
          title: 'The derelict relay station',
          locationId: before.scene?.locationId,
        });
        expect(begun.sceneId).not.toBe(before.scene?.id);
      } finally {
        await db2.close();
      }
    });

    it('refuses a move while no session is open', async () => {
      const db2 = await createTestDatabase('sessions_no_move');
      try {
        await seedFixture(db2.sql, SESSION_ONE);
        const campaignId = SESSION_ONE_CAMPAIGN_ID;
        const state = project(await readEvents(db2.sql, campaignId));
        const vesna = Object.values(state.characters).find((c) => c.callsign === 'Vesna')!.id;

        await expect(
          invokeMove(db2.sql, {
            campaignId,
            commandId: newId(),
            actor: PLAYER,
            moveId: 'move:adventure/face-danger',
            actorCharacterId: vesna,
            using: { using: 'stat', stat: 'edge' },
            adds: [],
            rng: actionRoll(6, [1, 1]),
          }),
        ).rejects.toThrow(MoveRejectedError);
        await expect(
          prepareRecap(db2.sql, { campaignId, commandId: newId(), actor: PLAYER }),
        ).rejects.toMatchObject({ reason: 'no_session' });
      } finally {
        await db2.close();
      }
    });
  });

  describe('the recap (9.1, D-147)', () => {
    const campaignId = SESSION_ONE_CAMPAIGN_ID;
    let db2: TestDatabase;

    beforeAll(async () => {
      db2 = await createTestDatabase('sessions_recap');
      await seedFixture(db2.sql, SESSION_ONE);
      await beginSession(db2.sql, { campaignId, commandId: newId(), actor: PLAYER });
    }, 60_000);

    afterAll(async () => {
      await db2?.close();
    });

    async function recapFacts() {
      const events = await readEvents(db2.sql, campaignId);
      const state = project(events);
      const previous = previousSession(events, state.session!.id)!;
      return describeRecap(events, state, previous.sessionId);
    }

    it("builds its facts from the last session's summary, open threads and significant events", async () => {
      const facts = await recapFacts();
      const texts = facts.facts.map((f) => `${f.kind}: ${f.text}`);

      expect(texts[0]).toMatch(
        /^summary: Summary of the last session: The crew of the Lantern Wake/,
      );
      expect(texts).toContain('summary: Left open: One row of windows on Varga Relay is lit.');
      expect(texts).toContain('scene: A scene: The derelict relay station, at Varga Relay.');
      expect(texts).toContain(
        'declared_action: The player declared: "Vesna threads the Lantern Wake through the ice of Kessel Drift."',
      );
      expect(texts.some((t) => t.startsWith('passage: As it was narrated: Vesna tucks'))).toBe(
        true,
      );
      // Rolls aren't significant: the summary and passages carry what came of them.
      expect(texts.some((t) => t.includes('challenge dice'))).toBe(false);
      expect(facts.declaredAction).toBe(true);
    });

    it("narrates the recap as segments, caused by the session's beginning, and only once", async () => {
      const facts = await recapFacts();
      const drift = facts.facts.find(
        (f) => f.kind === 'declared_action' && f.text.includes('Kessel Drift'),
      )!;
      const ai = new StubProvider({
        responses: [
          segments(
            ['world', null, ['F1'], "A dead colony ship's beacon led to Varga Relay."],
            [
              'character_does',
              'Vesna',
              [drift.key],
              'Vesna threaded the Lantern Wake through the Drift.',
            ],
          ),
        ],
      });
      const commandId = newId<CommandId>();
      const prepared = await prepareRecap(db2.sql, { campaignId, commandId, actor: PLAYER });
      if (prepared.kind !== 'run') throw new Error('expected a run');
      expect(prepared.aiRequest.purpose).toBe('recap');
      expect(prepared.aiRequest.user).toMatch(/Write 60 to 120 words/);

      const result = await runRecap(db2.sql, ai, new StubProvider(), prepared, SINK);

      expect(result.ok).toBe(true);
      const events = await readEvents(db2.sql, campaignId);
      const began = events.findLast((e) => e.type === 'session.began')!;
      const recap = events.find((e) => e.commandId === commandId && e.type === 'narration.written');
      expect(recap).toMatchObject({
        causedBy: began.id,
        sessionId: began.sessionId,
        payload: {
          role: 'recap',
          text: "A dead colony ship's beacon led to Varga Relay. Vesna threaded the Lantern Wake through the Drift.",
        },
      });

      const replay = await prepareRecap(db2.sql, { campaignId, commandId, actor: PLAYER });
      expect(replay).toEqual({ kind: 'replay', result });
      await expect(
        prepareRecap(db2.sql, { campaignId, commandId: newId(), actor: PLAYER }),
      ).rejects.toMatchObject({ reason: 'already_recapped' });
    });
  });

  it('withdraws a recap that has a character act beyond what was declared, and re-asks', async () => {
    const db2 = await createTestDatabase('sessions_recap_withdraw');
    try {
      const campaignId = SESSION_ONE_CAMPAIGN_ID;
      await seedFixture(db2.sql, SESSION_ONE);
      await beginSession(db2.sql, { campaignId, commandId: newId(), actor: PLAYER });
      const ai = new StubProvider({
        responses: [
          // The summary is not a declared action: Rook can't act on it.
          segments(['character_does', 'Rook', ['F1'], 'Rook checked every airlock twice.']),
          segments(['world', null, ['F1'], 'The beacon led to Varga Relay.']),
        ],
      });
      const prepared = await prepareRecap(db2.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
      });
      if (prepared.kind !== 'run') throw new Error('expected a run');

      const result = await runRecap(db2.sql, ai, new StubProvider(), prepared, SINK);

      expect(result.ok).toBe(true);
      expect(ai.requests).toHaveLength(2);
      const events = await readEvents(db2.sql, campaignId);
      expect(events.filter((e) => e.type === 'narration.withdrawn')).toHaveLength(1);
    } finally {
      await db2.close();
    }
  });

  it('asks for no recap in a first session', async () => {
    const campaignId = newId<CampaignId>();
    await createCampaign(db.sql, { campaignId, commandId: newId(), actor: PLAYER, name: 'x' });
    await beginSession(db.sql, {
      campaignId,
      commandId: newId(),
      actor: PLAYER,
      scene: { title: 'A quiet dock' },
    });
    await expect(
      prepareRecap(db.sql, { campaignId, commandId: newId(), actor: PLAYER }),
    ).rejects.toMatchObject({ reason: 'no_recap' });
  });

  it('shows the latest session in the narrative log, and begins sessions and recaps over HTTP', async () => {
    const db2 = await createTestDatabase('sessions_http');
    try {
      const campaignId = SESSION_ONE_CAMPAIGN_ID;
      await seedFixture(db2.sql, SESSION_ONE);
      const app = buildApp({
        sql: db2.sql,
        ai: new StubProvider({
          responses: [segments(['world', null, ['F1'], 'The beacon led to Varga Relay.'])],
        }),
        checker: new StubProvider(),
      });

      const sessionOneLog = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${campaignId}/log`,
      });
      const roles = (log: NarrativeLogResponse) =>
        log.beats.flatMap((b) =>
          b.entries.flatMap((e) =>
            e.event.type === 'narration.written' ? [e.event.payload.role] : [],
          ),
        );
      expect(roles(sessionOneLog.json<NarrativeLogResponse>())).toEqual([
        'beat',
        'beat',
        'beat',
        'beat',
      ]);

      const carried = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/sessions`,
        payload: { commandId: newId(), scene: { title: 'Elsewhere' } },
      });
      expect(carried.statusCode).toBe(422);
      expect(carried.json()).toMatchObject({ reason: 'scene_carried' });

      const begun = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/sessions`,
        payload: { commandId: newId() },
      });
      expect(begun.statusCode).toBe(201);
      expect(begun.json()).toMatchObject({ number: 2, recap: true });

      const recap = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/recaps`,
        payload: { commandId: newId() },
      });
      expect(recap.statusCode).toBe(200);
      expect(recap.body).toMatch(/"type":"committed"/);

      const sessionTwoLog = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${campaignId}/log`,
      });
      expect(roles(sessionTwoLog.json<NarrativeLogResponse>())).toEqual(['recap']);

      const again = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/recaps`,
        payload: { commandId: newId() },
      });
      expect(again.statusCode).toBe(422);
      expect(again.json()).toMatchObject({ reason: 'already_recapped' });
    } finally {
      await db2.close();
    }
  });
});
