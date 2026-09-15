import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LOCAL_PLAYER_ID,
  type Actor,
  type CampaignId,
  type CommandId,
  type NarrativeLogResponse,
} from '@astrolabe/shared';

import { describeRecap, owedPassages, previousSession } from '../ai/context/index.js';
import type { TextSink } from '../ai/respond.js';
import { StubProvider, type StubResponse } from '../ai/stub.js';
import {
  SESSION_ONE,
  SESSION_ONE_CAMPAIGN_ID,
  SESSION_TWO_OPEN,
  SESSION_TWO_OPEN_CAMPAIGN_ID,
  actionRoll,
  seedFixture,
} from '../fixtures/index.js';
import { buildApp } from '../http/app.js';
import { project } from '../projection/project.js';

import { createCampaign } from './campaign-commands.js';
import { readEvents } from './event-store.js';
import { setComplication } from './complication-commands.js';
import { invokeMove, MoveRejectedError, resolvePayThePriceMethod } from './move-commands.js';
import { prepareBeatNarration, runBeatNarration } from './narration-commands.js';
import {
  beginSession,
  endSession,
  prepareRecap,
  proposeSessionSummary,
  runRecap,
} from './session-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';
import { voidEvent } from './void-command.js';

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

describe.skipIf(!hasTestDatabase)('End a Session (9.4, D-149)', () => {
  const campaignId = SESSION_TWO_OPEN_CAMPAIGN_ID;
  const SUMMARY = {
    summary: 'The crew boarded the relay and found one circuit still drawing power.',
    openThreads: ['What is the circuit keeping alive?', 'Who scrubbed the beacon?'],
  };
  const proposal = (value: unknown): StubResponse => ({ kind: 'structured', value });

  it('proposes a checked summary from the session, and commits it unedited as the Guide’s', async () => {
    const db = await createTestDatabase('end_session');
    try {
      await seedFixture(db.sql, SESSION_TWO_OPEN);
      const ai = new StubProvider({ responses: [proposal(SUMMARY)] });
      const checker = new StubProvider();
      const commandId = newId<CommandId>();
      const proposed = await proposeSessionSummary(db.sql, ai, checker, {
        campaignId,
        commandId,
        actor: PLAYER,
      });

      if (!proposed.ok) throw new Error(proposed.message);
      expect(proposed).toMatchObject(SUMMARY);
      expect(ai.requests[0]?.purpose).toBe('session_summary');
      expect(ai.requests[0]?.user).toMatch(/A scene: The derelict relay station/);
      expect(checker.requests[0]?.user).toMatch(/summary of a session that is ending/);
      // Replay answers the same proposal, and the session is still open.
      expect(
        await proposeSessionSummary(db.sql, new StubProvider(), checker, {
          campaignId,
          commandId,
          actor: PLAYER,
        }),
      ).toEqual(proposed);
      expect(project(await readEvents(db.sql, campaignId)).session?.endedAt).toBeUndefined();

      const ended = await endSession(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        proposalEventId: proposed.eventId,
        ...SUMMARY,
      });
      expect(ended.edited).toBe(false);
      const events = await readEvents(db.sql, campaignId);
      const event = events.find((e) => e.id === ended.eventId);
      expect(event).toMatchObject({
        actor: { kind: 'ai' },
        causedBy: proposed.eventId,
        payload: { ...SUMMARY, proposalEventId: proposed.eventId },
      });
      const state = project(events);
      expect(state.session?.endedAt).toBeDefined();
      expect(state.canon.sessionSummaries.at(-1)).toMatchObject({ number: 2, ...SUMMARY });

      await expect(
        proposeSessionSummary(db.sql, new StubProvider(), checker, {
          campaignId,
          commandId: newId(),
          actor: PLAYER,
        }),
      ).rejects.toMatchObject({ reason: 'no_session' });
    } finally {
      await db.close();
    }
  });

  it('records an edited summary as the player’s, and refuses a proposal that isn’t live', async () => {
    const db = await createTestDatabase('end_session_edited');
    try {
      await seedFixture(db.sql, SESSION_TWO_OPEN);
      const proposed = await proposeSessionSummary(
        db.sql,
        new StubProvider({ responses: [proposal(SUMMARY)] }),
        new StubProvider(),
        { campaignId, commandId: newId(), actor: PLAYER },
      );
      if (!proposed.ok) throw new Error(proposed.message);

      await expect(
        endSession(db.sql, {
          campaignId,
          commandId: newId(),
          actor: PLAYER,
          proposalEventId: newId(),
          ...SUMMARY,
        }),
      ).rejects.toMatchObject({ reason: 'unknown_proposal' });

      const ended = await endSession(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        proposalEventId: proposed.eventId,
        summary: SUMMARY.summary,
        openThreads: [...SUMMARY.openThreads, 'Where is the flight recorder?'],
      });
      expect(ended.edited).toBe(true);
      const event = (await readEvents(db.sql, campaignId)).find((e) => e.id === ended.eventId);
      expect(event?.actor.kind).toBe('player');
    } finally {
      await db.close();
    }
  });

  it('re-asks threads that name a player character, then fails with the session still open', async () => {
    const db = await createTestDatabase('end_session_names');
    try {
      await seedFixture(db.sql, SESSION_TWO_OPEN);
      const naming = proposal({
        summary: SUMMARY.summary,
        openThreads: ['Whether Rook trusts the survivor', 'The failing power'],
      });
      const ai = new StubProvider({ responses: [naming, naming] });
      const result = await proposeSessionSummary(db.sql, ai, new StubProvider(), {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
      });

      expect(result.ok).toBe(false);
      expect(ai.requests[1]?.user).toMatch(/names Rook/);
      const state = project(await readEvents(db.sql, campaignId));
      expect(state.session?.endedAt).toBeUndefined();
    } finally {
      await db.close();
    }
  });

  it('withdraws a summary that gives a character a feeling, and re-asks', async () => {
    const db = await createTestDatabase('end_session_withdraw');
    try {
      await seedFixture(db.sql, SESSION_TWO_OPEN);
      const feeling = 'Rook was quietly afraid of the dark station.';
      const ai = new StubProvider({
        responses: [proposal({ ...SUMMARY, summary: feeling }), proposal(SUMMARY)],
      });
      const checker = new StubProvider({
        responses: [
          {
            kind: 'structured',
            value: {
              review: 'A feeling.',
              violations: [
                {
                  rule: 'player_interior',
                  character: 'Rook',
                  segment: null,
                  quote: 'quietly afraid',
                  why: 'A feeling the player did not state.',
                },
              ],
            },
          },
          { kind: 'structured', value: { review: 'Fine.', violations: [] } },
        ],
      });
      const result = await proposeSessionSummary(db.sql, ai, checker, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
      });

      expect(result).toMatchObject({ ok: true, summary: SUMMARY.summary });
      const withdrawn = (await readEvents(db.sql, campaignId)).filter(
        (e) => e.type === 'narration.withdrawn',
      );
      expect(withdrawn).toMatchObject([{ payload: { role: 'summary', rejectedText: feeling } }]);
    } finally {
      await db.close();
    }
  });
});

describe.skipIf(!hasTestDatabase)('resuming a campaign (9.5, D-150)', () => {
  const campaignId = SESSION_TWO_OPEN_CAMPAIGN_ID;

  it('reports each chain a passage has yet to cover, once, with any complication still owed', async () => {
    const db = await createTestDatabase('owed_passages');
    try {
      await seedFixture(db.sql, SESSION_TWO_OPEN);
      const state = project(await readEvents(db.sql, campaignId));
      const who = (callsign: string) =>
        Object.values(state.characters).find((c) => c.callsign === callsign)!.id;
      const owed = async () => {
        const events = await readEvents(db.sql, campaignId);
        return owedPassages(events, project(events).session!.id);
      };
      expect(await owed()).toEqual([]);

      // Beat 7's chain: a miss, Pay the Price, Endure Harm — one passage owed.
      const faceDanger = newId<CommandId>();
      await invokeMove(db.sql, {
        campaignId,
        commandId: faceDanger,
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: who('Rook'),
        using: { using: 'stat', stat: 'iron' },
        adds: [],
        actionText: 'Rook forces the sealed bulkhead.',
        rng: actionRoll(1, [8, 9]),
      });
      const payThePrice = newId<CommandId>();
      await resolvePayThePriceMethod(db.sql, {
        campaignId,
        commandId: payThePrice,
        actor: PLAYER,
        actorCharacterId: who('Rook'),
        optionId: 'obvious',
        chainedFromCommandId: faceDanger,
      });
      // Beat 3's weak hit, with its complication not yet set.
      const gather = newId<CommandId>();
      await invokeMove(db.sql, {
        campaignId,
        commandId: gather,
        actor: PLAYER,
        moveId: 'move:adventure/gather-information',
        actorCharacterId: who('Juno'),
        using: { using: 'stat', stat: 'wits' },
        adds: [],
        actionText: 'Juno pulls the station logs.',
        rng: actionRoll(3, [4, 7]),
      });
      // A move voided before it was narrated is owed nothing.
      const voided = await invokeMove(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        moveId: 'move:adventure/face-danger',
        actorCharacterId: who('Vesna'),
        using: { using: 'stat', stat: 'edge' },
        adds: [],
        rng: actionRoll(6, [1, 1]),
      });
      await voidEvent(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        targetEventId: voided.rollEventId,
        reason: 'Wrong move.',
        kind: 'player_void',
      });

      expect(await owed()).toEqual([
        {
          rootCommandId: faceDanger,
          moveId: 'move:adventure/face-danger',
          actorCharacterId: who('Rook'),
          actionText: 'Rook forces the sealed bulkhead.',
        },
        {
          rootCommandId: gather,
          moveId: 'move:adventure/gather-information',
          actorCharacterId: who('Juno'),
          actionText: 'Juno pulls the station logs.',
          complication: { moveCommandId: gather, clause: 'but also complicates your quest' },
        },
      ]);

      // Narrating the chain from its root settles it.
      const prepared = await prepareBeatNarration(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        afterCommandId: faceDanger,
      });
      if (prepared.kind !== 'run') throw new Error('expected a run');
      await runBeatNarration(
        db.sql,
        new StubProvider({
          responses: [segments(['world', null, [], 'The bulkhead holds, and sparks fly.'])],
        }),
        new StubProvider(),
        prepared,
        SINK,
      );
      await setComplication(db.sql, {
        campaignId,
        commandId: newId(),
        actor: PLAYER,
        moveCommandId: gather,
        text: 'One circuit still draws power.',
      });
      expect(await owed()).toEqual([
        {
          rootCommandId: gather,
          moveId: 'move:adventure/gather-information',
          actorCharacterId: who('Juno'),
          actionText: 'Juno pulls the station logs.',
        },
      ]);

      const app = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
      const response = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${campaignId}/state`,
      });
      expect(response.json()).toMatchObject({ owedPassages: [{ rootCommandId: gather }] });
    } finally {
      await db.close();
    }
  });
});
