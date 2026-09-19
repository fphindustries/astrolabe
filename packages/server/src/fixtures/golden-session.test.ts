import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  AstrolabeEvent,
  BeginSessionResponse,
  CampaignState,
  NarrationFrame,
  NarrativeEntry,
  NarrativeLogResponse,
} from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import { readEvents } from '../db/event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { buildApp } from '../http/app.js';
import { project } from '../projection/project.js';

import { playGoldenSession, type GoldenSessionRun } from './golden-session.js';

/**
 * The golden session as an automated test (10.4, §10, D-152).
 *
 * `playGoldenSession` plays session 2's ten beats through the HTTP routes
 * and throws on anything that goes wrong along the way. This reads back what
 * it wrote, beat by beat, against the acceptance criteria each beat tests.
 *
 * Not covered: A18's five-second target. The stub answers instantly, so
 * time to first text stays a live measurement (the `ai/eval/live-*.json`
 * runs).
 */
describe.skipIf(!hasTestDatabase)('the golden session, end to end (10.4, D-152)', () => {
  let db: TestDatabase;
  let run: GoldenSessionRun;
  let events: readonly AstrolabeEvent[];
  let state: CampaignState;
  let log: readonly NarrativeEntry[];

  beforeAll(async () => {
    db = await createTestDatabase('golden_session');
    run = await playGoldenSession(db.sql);
    events = await readEvents(db.sql, run.campaignId);
    state = project(events);
    // The log as the play screen reads it: the latest session's.
    const app = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${run.campaignId}/log?limit=200`,
    });
    log = response.json<NarrativeLogResponse>().beats.flatMap((beat) => beat.entries);
    await app.close();
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  const callsign = (name: string) =>
    Object.values(state.characters).find((c) => c.callsign === name)!;
  const byId = (id: string) => events.find((e) => e.id === id)!;
  const purposes = () => run.requests.map((r) => r.purpose);
  // By name and by role: the launch brings an NPC (the connection) and four
  // more vows (three background vows and the connection's) of its own.
  const valda = () => Object.values(state.entities).find((e) => e.name === 'Valda Thorn');
  const inciting = () => state.tracks[state.launch.activation!.vowTrackId!];
  const committedId = (frames: readonly NarrationFrame[]) => {
    const last = frames.at(-1);
    return last?.type === 'committed' ? last.eventId : undefined;
  };

  describe('Beat 1 — opening the session', () => {
    it('begins session 2 with a recap built from session 1’s summary (A1)', () => {
      expect(run.beats.began).toMatchObject({ number: 2, recap: true });
      const asked = run.requests.find((r) => r.purpose === 'recap')!;
      expect(asked.user).toContain('Summary of the last session:');
      expect(asked.user).toContain('Varga Relay');
      const recap = byId(committedId(run.beats.recap)!);
      expect(recap).toMatchObject({ type: 'narration.written', payload: { role: 'recap' } });
    });

    it('shows the location, the vow and every character’s meters from state (A1)', () => {
      expect(state.scene?.title).toBe('The derelict relay station');
      // 10.1c: the relay is a launch location, and the inciting vow is the one
      // Vesna swore at launch, among the crew's background vows (D-205).
      expect(state.launch.locations[state.scene!.locationId!]?.name).toBe('Varga Relay');
      const vow = inciting();
      expect(vow?.title).toBe("Recover the flight recorder of Meridian's Hope");
      expect(Object.values(state.characters)).toHaveLength(3);
    });
  });

  describe('Beat 2 — framing the scene', () => {
    it('frames the scene from derelict oracle rolls, shown as chips under the passage (A2)', () => {
      const frameId = committedId(run.beats.frame)!;
      expect(byId(frameId)).toMatchObject({ payload: { role: 'scene_frame' } });
      const entry = log.find((e) => e.event.id === frameId)!;
      expect(entry.chips?.map((c) => c.slot)).toEqual([
        'condition',
        'outer_first_look',
        'inner_first_look',
      ]);
      expect(entry.chips?.map((c) => c.rowText)).toEqual([
        'Damaged or breached',
        'Sending a signal or message',
        'Exposed wiring or conduits',
      ]);
      expect(state.scene?.framedBy).toBe(frameId);
    });
  });

  describe('Beat 3 — a player decision gets depth', () => {
    it('suggests a move for a typed action, with trigger text, reason and confidence (A19)', () => {
      expect(run.beats.suggestion).toMatchObject({
        ok: true,
        suggestion: {
          moveId: 'move:adventure/gather-information',
          triggerText: 'When you search for clues',
          confidence: 'high',
        },
      });
    });

    it('resolves the picked move to an outcome with its dice math (A3, A4)', () => {
      const { roll } = run.beats.junoScan;
      expect(roll.tier).toBe('weak_hit');
      expect(roll).toMatchObject({ actionDie: 3, actionScore: 6, challengeDice: [4, 9] });
      expect(roll.adds).toEqual([{ amount: 3, label: 'wits' }]);
      expect(run.beats.junoTrigger).toEqual({ ok: true, fits: true });
    });

    it('offers three complications grounded in Action + Theme rolls, and sets the one picked (A5)', () => {
      const { options, complication } = run.beats;
      if (!options.ok) throw new Error('expected options');
      expect(options.options).toHaveLength(3);
      expect(options.options.every((o) => o.chips.length === 2)).toBe(true);
      expect(complication.source).toBe('offered');
      const set = byId(complication.eventId);
      expect(set).toMatchObject({
        type: 'complication.set',
        payload: { text: expect.stringContaining('life-support circuit') },
      });
      // The picked option's rolls join the passage's chips.
      const passage = log.find((e) => e.event.id === run.beats.junoPassage)!;
      expect(passage.chips).toHaveLength(2);
    });

    it('narrates Juno’s declared action and nothing she did not declare (A21)', () => {
      const passage = byId(run.beats.junoPassage);
      if (passage.type !== 'narration.written') throw new Error('expected a passage');
      expect(passage.payload.segments?.find((s) => s.about === 'character_does')?.text).toBe(
        'Juno jacks into the docking port and pulls the station logs.',
      );
      expect(events.some((e) => e.type === 'narration.withdrawn')).toBe(false);
    });
  });

  describe('Beat 4 — the stall and the nudge', () => {
    it('answers What now? with three anchored suggestions, only when asked (A6)', () => {
      const { whatNow } = run.beats;
      if (!whatNow.ok) throw new Error('expected suggestions');
      expect(whatNow.suggestions).toHaveLength(3);
      expect(whatNow.suggestions.every((s) => s.anchors.length > 0)).toBe(true);
      expect(purposes().filter((p) => p === 'what_now')).toHaveLength(1);
    });
  });

  describe('Beat 5 — helping an ally, and a momentum decision', () => {
    it('gives the aided ally the benefits of Rook’s strong hit (A7)', () => {
      expect(run.beats.rookAid.roll.tier).toBe('strong_hit');
      expect(callsign('Rook').momentum.value).toBe(2);
      // Vesna's +1 on her next move was applied to her scan, and spent.
      expect(run.beats.vesnaScan.roll.adds).toContainEqual(expect.objectContaining({ amount: 1 }));
      expect(callsign('Vesna').bonusNextMove).toBeUndefined();
    });

    it('offers to burn momentum with its cost, and the burn upgrades the outcome (A8)', () => {
      const { roll } = run.beats.vesnaScan;
      expect(roll).toMatchObject({ actionScore: 5, challengeDice: [6, 3], tier: 'weak_hit' });
      // 7 + 2 from Rook's aid.
      expect(roll.burnOffer).toEqual({ wouldBecome: 'strong_hit', momentum: 9, resetsTo: 2 });
      expect(run.beats.burnedTo).toBe('strong_hit');
      expect(callsign('Vesna').momentum.value).toBe(2);
      const rolled = log.find((e) => e.event.id === run.beats.vesnaScan.rollEventId);
      expect(rolled?.burnTaken).toBe(true);
    });
  });

  describe('Beat 6 — the world gets a new face', () => {
    it('establishes the NPC as a tracked entity badged as AI-established (A10)', () => {
      const npc = valda();
      expect(npc).toMatchObject({
        name: 'Valda Thorn',
        provenance: { establishedBy: 'ai', recipeId: 'recipe:npc' },
      });
    });

    it('rerolls the result that contradicts the logs, and keeps the discarded roll struck through (A9)', () => {
      const firstLooks = log.filter(
        (e) => e.event.type === 'oracle.rolled' && e.event.payload.slot === 'first_look',
      );
      expect(firstLooks).toHaveLength(2);
      const [discarded, survivor] = firstLooks;
      expect(discarded).toMatchObject({
        voided: true,
        voidedBy: [{ kind: 'reroll', reason: expect.stringContaining('evacuation logs') }],
      });
      expect(survivor?.voided).toBe(false);
      const npc = valda()!;
      expect(npc.provenance.groundedIn).toContain(survivor!.event.id);
      expect(npc.provenance.groundedIn).not.toContain(discarded!.event.id);
    });

    it('narrates first contact in a follow-up passage of its own', () => {
      const contact = byId(committedId(run.beats.firstContact)!);
      expect(contact).toMatchObject({
        type: 'narration.written',
        payload: { text: expect.stringContaining('Valda Thorn') },
      });
    });
  });

  describe('Beat 7 — a miss and the price', () => {
    it('voids the +edge roll and keeps it in the log, struck through with its reason (A11)', () => {
      expect(run.beats.voided.cascaded).toBeGreaterThan(0);
      const voidedRoll = log.find((e) => e.event.id === run.beats.rookEdge.rollEventId);
      expect(voidedRoll).toMatchObject({
        voided: true,
        voidedBy: [{ kind: 'player_void', reason: expect.stringContaining('+iron, not +edge') }],
      });
    });

    it('offers Pay the Price on the miss and chains the table result into Endure Harm (A12)', () => {
      expect(run.beats.rookIron.roll.tier).toBe('miss');
      expect(run.beats.rookIron.chain).toMatchObject({
        toMoveId: 'move:fate/pay-the-price',
        mode: 'offer',
      });
      expect(run.beats.price).toMatchObject({
        oracle: { roll: 80, rowText: 'You are harmed' },
        chain: { toMoveId: 'move:suffer/endure-harm', mode: 'auto' },
      });
    });

    it('applies the harm the player adjusted, not the amount the Guide proposed (A13)', () => {
      expect(run.beats.proposal).toMatchObject({ ok: true, amount: -2 });
      expect(callsign('Rook').meters.health.value).toBe(4);
      expect(run.beats.endureHarm.roll.tier).toBe('weak_hit');
    });
  });

  describe('Beat 8 — pressure builds', () => {
    it('creates a clock and fills a segment, with who did it and why (A14)', () => {
      const clock = Object.values(state.tracks).find((t) => t.kind === 'clock');
      expect(clock).toMatchObject({
        title: 'Station power failing',
        ticks: 1,
        maxTicks: 4,
        lastChangedBy: { actorKind: 'ai', reason: expect.stringContaining('load-shedding') },
      });
    });
  });

  describe('Beat 9 — corrections', () => {
    it('reads the passage as its correction, with the original and the note kept (A15)', () => {
      const passage = log.find((e) => e.event.id === run.beats.harmPassage)!;
      expect(passage.narration).toMatchObject({
        corrected: true,
        text: expect.stringContaining('scorched'),
        original: expect.stringContaining('A thin burn opens'),
        note: expect.stringContaining('armor took the worst'),
      });
    });

    it('logs the manual momentum override as the player’s (A16)', () => {
      // D-61: the weak hit took Juno from +3 to +4, so one too low sets +5.
      expect(run.beats.override).toEqual({ from: 4, to: 5 });
      expect(callsign('Juno').momentum).toMatchObject({
        value: 5,
        lastChangedBy: { actorKind: 'player' },
      });
      expect(log.some((e) => e.event.type === 'state.overridden')).toBe(true);
    });
  });

  describe('Beat 10 — ending the session', () => {
    it('ends with the Guide’s summary and open threads, and leaves the vow for the player (A17)', () => {
      expect(run.beats.ended.edited).toBe(false);
      expect(state.session).toMatchObject({ number: 2, endedAt: expect.any(String) });
      const ended = byId(run.beats.ended.eventId);
      expect(ended).toMatchObject({
        type: 'session.ended',
        actor: { kind: 'ai' },
        payload: {
          openThreads: [
            "Valda Thorn's intent",
            "The station's failing power",
            "Where the Meridian's Hope flight recorder is",
          ],
        },
      });
      // Reach a Milestone is the player's call: nothing marked progress on the vow.
      expect(inciting()?.ticks).toBe(0);
    });

    it('feeds the next session’s recap (A17 → A1)', async () => {
      const guide = new StubProvider({
        responses: [
          {
            kind: 'structured',
            value: {
              segments: [
                {
                  about: 'world',
                  character: null,
                  basis: ['F1'],
                  text: 'Varga Relay is losing power.',
                },
              ],
            },
          },
        ],
      });
      const app = buildApp({ sql: db.sql, ai: guide, checker: new StubProvider() });
      try {
        const base = `/api/campaigns/${run.campaignId}`;
        const began = await app.inject({
          method: 'POST',
          url: `${base}/sessions`,
          payload: { commandId: crypto.randomUUID() },
        });
        expect(began.json<BeginSessionResponse>()).toMatchObject({ number: 3, recap: true });
        const recap = await app.inject({
          method: 'POST',
          url: `${base}/recaps`,
          payload: { commandId: crypto.randomUUID() },
        });
        expect(recap.body).toContain('"type":"committed"');
        const asked = guide.requests[0]!.user;
        expect(asked).toContain('Valda Thorn, who warned the crew off over comms');
        expect(asked).toContain("Left open: Valda Thorn's intent");
      } finally {
        await app.close();
      }
    });
  });

  describe('the log behind it', () => {
    it('records every AI call’s tokens against the session (D-75)', () => {
      const completed = events.filter(
        (e) => e.type === 'ai.completed' && e.sessionId === run.sessionTwoId,
      );
      expect(completed.length).toBeGreaterThan(10);
    });

    it('projects identically on a second read', () => {
      expect(project(events)).toEqual(state);
    });

    it('reads back the same state from a cold rebuild of the stored log', async () => {
      // Only what the fixture wrote: Beat 10's last test begins session 3 on top.
      const stored = (await readEvents(db.sql, run.campaignId)).slice(0, events.length);
      expect(project(stored)).toEqual(state);
      expect(stored.map((e) => e.seq)).toEqual(stored.map((_, i) => i + 1));
    });
  });
});
