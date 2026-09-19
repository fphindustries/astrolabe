import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installedModules, STARFORGED, type CharacterId } from '@astrolabe/rules';
import type {
  AstrolabeEvent,
  CampaignId,
  CampaignState,
  LaunchWorkspaceResponse,
} from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import { readEvents } from '../db/event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { buildApp } from '../http/app.js';
import { project } from '../projection/project.js';

import { fixtureUuid } from './ids.js';
import {
  INCITING_INCIDENT,
  LANTERN_WAKE_LAUNCH,
  OPENING_SCENE,
  playLanternWakeLaunch,
  type LaunchRun,
} from './lantern-wake-launch.js';

/**
 * The golden launch as an automated test (10.2, A22–A44, D-205).
 *
 * `playLanternWakeLaunch` plays beats 1–13 through the HTTP routes with loaded
 * dice and a scripted Guide, and throws on anything that goes wrong along the
 * way. This reads back what it wrote, beat by beat.
 *
 * | Criterion | Where it is asserted |
 * |---|---|
 * | A22, A23 | Beat 1; and "resumes every section" below |
 * | A24–A26 | Beat 2 |
 * | A27–A29 | Beats 3–5 |
 * | A30 | Beat 6 |
 * | A31–A34 | Beats 7–8 |
 * | A35 | Beat 9 |
 * | A36 | Beat 10 |
 * | A37 | Beat 11 |
 * | A38–A40 | Beats 12–13, and "is one-way" below |
 * | A41 | "grounds every Guide-read fact" below, and each beat's provenance |
 * | A42 | `no-provider-launch.test.ts` (10.3) |
 * | A43 | `legacy-log.test.ts` and `launch-routes.test.ts` (10.1) |
 * | A44 | this file, and `fixtures.test.ts`: session 1 continues from this run |
 */
describe.skipIf(!hasTestDatabase)('the golden launch, end to end (10.2, D-205)', () => {
  let db: TestDatabase;
  let run: LaunchRun;
  let events: readonly AstrolabeEvent[];
  let state: CampaignState;

  beforeAll(async () => {
    db = await createTestDatabase('golden_launch');
    run = await playLanternWakeLaunch(db.sql, {
      fixture: LANTERN_WAKE_LAUNCH,
      campaignId: fixtureUuid<CampaignId>(LANTERN_WAKE_LAUNCH, 'campaign'),
      campaignName: 'Lantern Wake',
    });
    events = await readEvents(db.sql, run.campaignId);
    state = project(events);
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  const launch = () => state.launch;
  const byId = (id: string) => events.find((event) => event.id === id);
  const character = (name: string) => Object.values(state.characters).find((c) => c.name === name)!;
  const location = (name: string) =>
    Object.values(launch().locations).find((l) => l.name === name)!;

  describe('Beat 1 — begin a campaign (A22, A23)', () => {
    it('opens a launch workspace of seven sections, not play', () => {
      const reopened = run.beats.reopened;
      expect(Object.keys(reopened.readiness.sections)).toHaveLength(7);
      expect(reopened.launchOpen).toBe(true);
      expect(reopened.state.session).toBeNull();
    });

    it('restores the saved premise as setup, not canon', () => {
      const reopened = run.beats.reopened.state.launch;
      expect(reopened.drafts.foundation?.snapshot.premise).toMatch(/lost colony ship/);
      expect(reopened.foundation).toBeUndefined();
    });
  });

  describe('Beat 2 — the truths (A24–A26)', () => {
    it('decides all fourteen, four ways, with Horrors left open', () => {
      const decisions = Object.values(launch().truthDecisions);
      expect(decisions).toHaveLength(STARFORGED.truths.length);
      const ways = new Set(decisions.map((decision) => decision.resolution));
      expect([...ways].sort()).toEqual(['custom', 'leave_open', 'rolled', 'selected']);
      expect(launch().truthDecisions['oracle:horrors' as never]?.resolution).toBe('leave_open');
    });

    it('keeps a subchoice as part of the truth, and a quest starter apart from it', () => {
      const cataclysm = launch().truthDecisions['oracle:cataclysm' as never]!;
      expect(cataclysm.subchoiceId).toBe('oracle:cataclysm/0');
      expect(cataclysm.questStarter).toBeDefined();
      expect(cataclysm.text).not.toContain(cataclysm.questStarter!);
    });

    it('records each path, and a revision with its history (A40)', () => {
      const decided = (id: string) => launch().truthDecisions[id as never]!;
      expect(decided('oracle:laws').provenance).toBe('oracle_roll');
      expect(decided('oracle:laws').groundedIn).toHaveLength(1);
      expect(decided('oracle:exodus').provenance).toBe('official_choice');
      expect(decided('oracle:lifeforms').provenance).toBe('player_written');
      expect(decided('oracle:iron').optionIndex).toBe(0);
      expect(launch().truthHistory['oracle:iron' as never]).toHaveLength(1);
    });
  });

  describe('Beats 3–5 — the crew (A27–A29)', () => {
    it('is three complete characters, each with a vow of their own', () => {
      expect(Object.values(state.characters)).toHaveLength(3);
      for (const member of Object.values(state.characters)) {
        expect(member.appearance).toBeDefined();
        expect(member.backstory).toBeDefined();
        expect(member.vowTrackIds.length).toBeGreaterThan(0);
        expect(member.meters.health.value).toBe(5);
      }
    });

    it('keeps Vesna’s proposal, edited in one asset, and her signature gear', () => {
      const vesna = character('Vesna Kade');
      expect(run.beats.vesnaProposal.ok).toBe(true);
      expect(vesna.provenance).toBe('guide_proposal_edited');
      expect(vesna.assets).toContain('asset:module/sensor-array');
      expect(vesna.pronouns).toBe('she/her');
      expect(vesna.signatureGear).toMatch(/sextant/);
    });

    it('builds Rook by hand, with no pronouns guessed and his past left to play', () => {
      const rook = character('Rook Ilari');
      expect(rook.provenance).toBe('player_written');
      expect(rook.pronouns ?? null).toBeNull();
      expect(rook.backstory).toEqual({ kind: 'discover_in_play' });
      expect(rook.groundedIn ?? []).toEqual([]);
    });

    it('builds Juno with the Guide’s help on her hooks alone', () => {
      const juno = character('Juno Marr');
      expect(run.beats.junoProposal.ok).toBe(true);
      expect(juno.provenance).toBe('guide_proposal_edited');
      expect(juno.hooks[0]).toMatch(/still believes/);
    });

    it('creates no character from a proposal until it is accepted', () => {
      const firstProposal = events.findIndex(
        (event) => event.type === 'creation.proposed' && event.payload.targetKind === 'character',
      );
      const firstCharacter = events.findIndex((event) => event.type === 'character.created');
      expect(firstProposal).toBeGreaterThan(-1);
      expect(firstCharacter).toBeGreaterThan(firstProposal);
    });
  });

  describe('Beat 6 — the Lantern Wake (A30)', () => {
    it('is one shared ship at integrity 5, from an edited proposal', () => {
      const ship = launch().starship!;
      expect(ship.name).toBe('Lantern Wake');
      expect(ship.integrity.value).toBe(5);
      expect(ship.provenance).toBe('guide_proposal_edited');
      expect(ship.quirks[0]).toMatch(/slightly off/);
    });

    it('carries Vesna’s Sensor Array as her module', () => {
      const modules = installedModules(Object.values(state.characters), STARFORGED);
      expect(modules).toContainEqual(
        expect.objectContaining({
          assetId: 'asset:module/sensor-array',
          ownerCharacterId: run.characters.vesna,
        }),
      );
    });
  });

  describe('Beats 7–8 — the Outlands, drawn (A31–A34)', () => {
    it('meets the Outlands baseline, and each settlement is complete', () => {
      expect(launch().sector?.region).toBe('outlands');
      const settlements = Object.values(launch().locations).filter((l) => l.kind === 'settlement');
      expect(settlements).toHaveLength(3);
      for (const settlement of settlements) {
        if (settlement.kind !== 'settlement') continue;
        expect(settlement.population).not.toBe('');
        expect(settlement.authority).not.toBe('');
        expect(settlement.projects.length).toBeGreaterThanOrEqual(1);
      }
      expect(launch().routes.length).toBeGreaterThanOrEqual(2);
    });

    it('builds one settlement from the Guide, one by hand, and one from rolls', () => {
      expect(location('Deepwater Anchorage').provenance).toBe('guide_proposal_edited');
      expect(location('Varga Relay').groundedIn).toEqual([]);
      const third = launch().locations[run.locations.third]!;
      expect(third.groundedIn.length).toBeGreaterThan(0);
    });

    it('details planets only as deep as Chapter 2 asks (A33)', () => {
      const third = launch().locations[run.locations.third]!;
      const planet = third.kind === 'settlement' ? launch().locations[third.planetId!] : undefined;
      expect(planet).toMatchObject({ kind: 'planet', planetClass: 'rocky' });
      expect(location('Deepwater Anchorage')).toMatchObject({ location: 'deep_space' });
    });

    it('places every node on the map, with an off-map exit (A34)', () => {
      for (const id of Object.values(run.locations)) expect(launch().layout[id]).toBeDefined();
      expect(launch().routes.some((route) => typeof route.to !== 'string')).toBe(true);
      expect(location('Kessel Drift').kind).toBe('other');
    });
  });

  describe('Beat 9 — the start and its trouble (A35)', () => {
    it('starts at Deepwater Anchorage, with its first looks and its trouble', () => {
      expect(launch().startingSettlementId).toBe(run.locations.anchorage);
      const anchorage = location('Deepwater Anchorage');
      expect(anchorage.kind === 'settlement' ? anchorage.firstLooks : []).toHaveLength(2);
      const troubles = Object.values(launch().troubles);
      expect(troubles.map((trouble) => trouble.kind).sort()).toEqual(['sector', 'settlement']);
      const settlementTrouble = troubles.find((trouble) => trouble.kind === 'settlement')!;
      expect(settlementTrouble.provenance).toBe('guide_proposal_edited');
      const sectorTrouble = troubles.find((trouble) => trouble.kind === 'sector')!;
      expect(sectorTrouble.provenance).toBe('guide_proposal');
    });
  });

  describe('Beat 10 — a local connection (A36)', () => {
    it('is shared by all three, on a track, as an automatic strong hit with no die', () => {
      const connection = launch().connection!;
      expect(connection).toMatchObject({ role: 'Anchorage harbormaster', rank: 'dangerous' });
      expect(connection.automaticStrongHit).toBe(true);
      expect([...connection.participants].sort()).toEqual(Object.values(run.characters).sort());
      expect(state.tracks[connection.trackId]?.participantCharacterIds).toHaveLength(3);
      const connectionEvents = events.filter(
        (event) => event.commandId === byId(connection.eventId)?.commandId,
      );
      expect(connectionEvents.some((event) => event.type === 'dice.rolled')).toBe(false);
    });
  });

  describe('Beat 11 — the inciting incident (A37)', () => {
    it('offers three options, each grounded in its own roll, and accepts one edited', () => {
      if (!run.beats.incidents.ok) throw new Error('no incidents');
      const options = run.beats.incidents.proposal.options;
      expect(options).toHaveLength(3);
      for (const option of options) {
        expect(option.groundedIn).toHaveLength(1);
        expect(byId(option.groundedIn[0]!)?.type).toBe('oracle.rolled');
      }
      const incident = launch().incident!;
      expect(incident.text).toBe(INCITING_INCIDENT);
      expect(incident.provenance).toBe('guide_proposal_edited');
      expect(incident.citedFactEventIds.length).toBeGreaterThan(0);
    });
  });

  describe('Beats 12–13 — launch, and the first vow (A38–A40)', () => {
    it('begins Session 1 on the approved scene at the start', () => {
      expect(run.beats.ready.readiness.ready).toBe(true);
      expect(launch().phase).toBe('active');
      expect(state.session?.number).toBe(1);
      expect(state.scene).toMatchObject({
        title: OPENING_SCENE,
        locationId: run.locations.anchorage,
      });
    });

    it('makes Swear an Iron Vow the first move, sworn by Vesna and shared by all three', () => {
      const activated = events.findIndex((event) => event.type === 'campaign.activated');
      const firstMove = events.findIndex((event) => event.type === 'move.invoked');
      expect(firstMove).toBeGreaterThan(activated);
      expect(byId(run.beats.swear.invocationEventId)).toMatchObject({
        payload: { moveId: 'move:quest/swear-an-iron-vow', actorCharacterId: run.characters.vesna },
      });
      expect(state.tracks[run.vowId]).toMatchObject({
        kind: 'vow',
        title: INCITING_INCIDENT,
        rank: 'formidable',
      });
      expect([...(state.tracks[run.vowId]?.participantCharacterIds ?? [])].sort()).toEqual(
        Object.values(run.characters).sort(),
      );
    });

    it('applies the move’s momentum to Vesna alone, and narrates it', () => {
      const momentum = (id: CharacterId) => state.characters[id]!.momentum.value;
      expect(momentum(run.characters.vesna)).toBe(4);
      expect(momentum(run.characters.rook)).toBe(2);
      expect(momentum(run.characters.juno)).toBe(2);
      expect(byId(run.beats.swearPassage)).toMatchObject({ type: 'narration.written' });
    });

    it('is one-way: launch is closed, and a launch command is refused (A40)', async () => {
      expect(run.beats.launched.launchOpen).toBe(false);
      const app = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
      try {
        const again = await app.inject({
          method: 'POST',
          url: `/api/campaigns/${run.campaignId}/launch/activate`,
          payload: { commandId: crypto.randomUUID() },
        });
        expect(again.statusCode).toBe(422);
        const truth = await app.inject({
          method: 'POST',
          url: `/api/campaigns/${run.campaignId}/launch/truths`,
          payload: {
            commandId: crypto.randomUUID(),
            truthId: 'oracle:horrors',
            resolution: 'custom',
            text: 'Too late.',
          },
        });
        expect(truth.statusCode).toBe(422);
      } finally {
        await app.close();
      }
    });
  });

  it('grounds every Guide-read fact in the rolls it read, each shown as a chip (A41)', () => {
    const chips = run.beats.launched.chips;
    const grounded = [
      ...Object.values(state.characters).map((member) => member.groundedIn ?? []),
      launch().starship!.groundedIn,
      location('Deepwater Anchorage').groundedIn,
      ...Object.values(launch().troubles).map((trouble) => trouble.groundedIn),
      launch().connection!.groundedIn,
      launch().incident!.groundedIn,
    ];
    for (const ids of grounded)
      for (const id of ids) {
        expect(byId(id)?.type).toBe('oracle.rolled');
        expect(chips[id]).toBeDefined();
      }
    expect(grounded.flat().length).toBeGreaterThan(20);
  });

  it('projects cold from its complete log to the state the routes served', () => {
    expect(project(events)).toEqual(run.beats.launched.state);
  });

  describe('save, restart, and resume (the final sign-off)', () => {
    it('resumes every section’s draft through a fresh server over the same database', async () => {
      const campaignId = crypto.randomUUID();
      const drafts = [
        { section: 'foundation', snapshot: { premise: 'A saved premise.' } },
        {
          section: 'truths',
          snapshot: { decisions: [{ truthId: 'oracle:cataclysm', resolution: 'selected' }] },
        },
        { section: 'crew', snapshot: { characters: [{ draftId: 'draft-1', name: 'Saved' }] } },
        { section: 'starship', snapshot: { starship: { name: 'Saved Wake' } } },
        { section: 'sector', snapshot: { name: 'Saved Reach', region: 'outlands' } },
        {
          section: 'connection_troubles',
          snapshot: { connection: { npcName: 'Saved Contact' }, troubles: [] },
        },
        { section: 'incident_launch', snapshot: { incident: { text: 'A saved incident.' } } },
      ];

      const first = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
      try {
        await first.inject({
          method: 'POST',
          url: '/api/campaigns',
          payload: { campaignId, commandId: crypto.randomUUID(), name: 'Resumed' },
        });
        for (const draft of drafts) {
          const saved = await first.inject({
            method: 'PUT',
            url: `/api/campaigns/${campaignId}/launch/drafts`,
            payload: { commandId: crypto.randomUUID(), draft },
          });
          expect(saved.statusCode, draft.section).toBeLessThan(300);
        }
      } finally {
        await first.close();
      }

      // The process restart: a new server, nothing held in memory.
      const second = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
      try {
        const reopened = await second.inject({
          method: 'GET',
          url: `/api/campaigns/${campaignId}/launch`,
        });
        const workspace = reopened.json<LaunchWorkspaceResponse>();
        for (const draft of drafts)
          expect(
            workspace.state.launch.drafts[
              draft.section as keyof typeof workspace.state.launch.drafts
            ]?.snapshot,
            draft.section,
          ).toMatchObject(draft.snapshot);
        // Drafts are setup, not canon (D-161): nothing is accepted.
        expect(workspace.state.launch.foundation).toBeUndefined();
        expect(Object.keys(workspace.state.characters)).toHaveLength(0);
        // An unanswered truth still blocks (A24).
        expect(workspace.readiness.problems.map((p) => p.code)).toContain('truth_missing');
      } finally {
        await second.close();
      }
    });

    it('answers a replayed launch command with its first answer, and writes nothing', async () => {
      const campaignId = crypto.randomUUID();
      const app = buildApp({ sql: db.sql, ai: new StubProvider(), checker: new StubProvider() });
      try {
        await app.inject({
          method: 'POST',
          url: '/api/campaigns',
          payload: { campaignId, commandId: crypto.randomUUID(), name: 'Replayed' },
        });
        const body = {
          commandId: crypto.randomUUID(),
          truthId: 'oracle:horrors',
          resolution: 'leave_open',
        };
        const once = await app.inject({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/launch/truths`,
          payload: body,
        });
        const count = (await readEvents(db.sql, campaignId as CampaignId)).length;
        const twice = await app.inject({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/launch/truths`,
          payload: body,
        });
        expect(twice.statusCode).toBe(once.statusCode);
        expect(twice.json()).toEqual(once.json());
        expect(await readEvents(db.sql, campaignId as CampaignId)).toHaveLength(count);
      } finally {
        await app.close();
      }
    });
  });
});
