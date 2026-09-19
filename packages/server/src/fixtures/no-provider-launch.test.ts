import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';
import type {
  AiStatusResponse,
  AstrolabeEvent,
  CampaignId,
  CreateCharacterResponse,
  LaunchWorkspaceResponse,
  NarrationFrame,
  RollLaunchRecipeResponse,
  SaveLaunchLocationResponse,
} from '@astrolabe/shared';

import { ClaudeProvider } from '../ai/claude.js';
import { StubProvider } from '../ai/stub.js';
import { readEvents } from '../db/event-store.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';
import { project } from '../projection/project.js';

import { action, d100, openScript } from './http-script.js';
import { fixtureUuid } from './ids.js';

/**
 * Campaign Launch without a Guide (10.3, A42).
 *
 * The same kind of launch the golden launch plays, with the provider the app
 * ships with when no key is set: every section is completed by hand and by
 * server rolls. Every proposal route answers that no Guide is configured and
 * writes no fact. Activation and the vow's roll go through; narration then
 * pauses, which is play's contract (D-116), not launch's.
 */

const PATHS = STARFORGED.assets
  .filter((asset) => asset.categoryId === 'path')
  .slice(0, 3)
  .map((asset) => asset.id);

describe.skipIf(!hasTestDatabase)('Campaign Launch with no Guide configured (10.3, A42)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('no_provider_launch');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it('completes the launch by hand and by rolls, refusing every proposal without writing a fact', async () => {
    const fixture = 'no-provider-launch';
    const campaignId = fixtureUuid<CampaignId>(fixture, 'campaign');
    const unconfigured = new ClaudeProvider({ configured: false });
    const script = openScript(db.sql, { fixture, campaignId, provider: unconfigured });
    const { http, id, rolling } = script;
    const factsBefore: AstrolabeEvent['type'][] = [];
    /** A proposal answers `not_configured`, and its command writes no proposal and no fact. */
    const refused = async (label: string, path: string, body: Record<string, unknown>) => {
      const answer = await http.attempt('POST', path, { commandId: id(label), ...body });
      expect(answer.status, label).toBeLessThan(300);
      expect(answer.json<{ ok: boolean; errorKind: string }>(), label).toMatchObject({
        ok: false,
        errorKind: 'not_configured',
      });
      const written = (await readEvents(db.sql, campaignId)).filter(
        (event) => event.commandId === id(label),
      );
      expect(
        written.filter((event) => !['oracle.rolled', 'ai.failed'].includes(event.type)),
        label,
      ).toEqual([]);
      factsBefore.push(...written.map((event) => event.type));
    };
    const recipe = (label: string, selector: Record<string, unknown>, faces: number[]) =>
      rolling(d100(...faces), () =>
        http.post<RollLaunchRecipeResponse>('/launch/recipe-rolls', {
          commandId: id(`${label}:roll`),
          selector,
        }),
      );

    try {
      const status = await script.app.inject({ method: 'GET', url: '/api/ai/status' });
      expect(status.json<AiStatusResponse>()).toMatchObject({
        configured: false,
        available: false,
      });

      // Foundation.
      await http.root('/campaigns', {
        campaignId,
        commandId: id('campaign'),
        name: 'Unguided',
      });
      await http.post('/launch/foundation', {
        commandId: id('foundation'),
        premise: 'A crew with no Guide, and every table in the book.',
        settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
      });

      // Truths: the Guide is asked once and declines; the rest are picked,
      // rolled by the server, or left open.
      await refused('truth:proposal', '/truth-proposals', { truthId: 'oracle:cataclysm' });
      for (const [index, truth] of STARFORGED.truths.entries()) {
        const body =
          index % 3 === 0
            ? { resolution: 'rolled' }
            : index % 3 === 1
              ? { resolution: 'selected', optionIndex: 1 }
              : { resolution: 'leave_open' };
        // A rolled row with a subchoice rolls it too (A25): Cataclysm's and Magic's here.
        const subchoice = STARFORGED.truths[index]!.rows.find(
          (row) => row.min <= 40 && 40 <= row.max,
        )?.subchoice;
        await rolling(
          index % 3 === 0 ? d100(40, ...(subchoice === undefined ? [] : [40])) : [],
          () =>
            http.post('/launch/truths', {
              commandId: id(`truth:${truth.id}`),
              truthId: truth.id,
              ...body,
            }),
        );
      }

      // Crew: a character rolled for inspiration, the Guide declines, the rest by hand.
      const characterRolls = await recipe('crew', { kind: 'character' }, [10, 20, 30, 40, 50]);
      await refused('crew:proposal', '/character-proposals', {
        concept: 'A pilot.',
        targetId: 'draft-1',
        groundedIn: characterRolls.results.map((r) => r.eventId),
      });
      const { characterId } = await http.post<CreateCharacterResponse>('/launch/crew', {
        commandId: id('crew'),
        draft: {
          name: 'Ash Valk',
          callsign: 'Dash',
          stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
          assets: PATHS,
        },
        backgroundVow: { title: 'Outfly the past', rank: 'dangerous' },
        groundedIn: characterRolls.results.map((r) => r.eventId),
        launch: { appearance: 'Flight suit, patched', backstory: { kind: 'discover_in_play' } },
      });

      // The ship: its recipe rolled, the Guide declines, the rolled words kept.
      const shipRolls = await recipe('ship', { kind: 'starship', quirkCount: 1 }, [40, 30, 50]);
      await refused('ship:proposal', '/starship-proposals', {
        groundedIn: shipRolls.results.map((r) => r.eventId),
      });
      const shipRow = (slot: string) => shipRolls.results.find((r) => r.slot === slot)!.text;
      await http.post('/launch/starship', {
        commandId: id('ship'),
        starship: {
          name: shipRow('name'),
          appearance: 'A plain hull, nothing to look at.',
          history: shipRow('history'),
          quirks: [shipRow('quirk_1')],
        },
        groundedIn: shipRolls.results.map((r) => r.eventId),
      });

      // The sector: the Expanse, two settlements by hand, one passage.
      await http.post('/launch/sector', {
        commandId: id('sector'),
        sector: { name: 'The Quiet Expanse', region: 'expanse' },
      });
      // The server rolls every recipe first; the rolls stay the player's (A42).
      const sectorProposal = await rolling(
        d100(30, 60, 12, 90, 40, 50, 22, 33, 85, 60, 20, 44),
        () => http.attempt('POST', '/sector-proposals', { commandId: id('sector:proposal') }),
      );
      expect(sectorProposal.json<{ name: { errorKind: string } }>().name).toMatchObject({
        ok: false,
        errorKind: 'not_configured',
      });
      const settlement = async (label: string, name: string) =>
        (
          await http.post<SaveLaunchLocationResponse>('/launch/locations', {
            commandId: id(`settlement:${label}`),
            location: {
              kind: 'settlement',
              name,
              location: 'deep_space',
              population: 'Dozens',
              authority: 'None',
              projects: ['Staying alive'],
            },
          })
        ).locationId;
      const home = await settlement('home', 'Cold Harbor');
      const far = await settlement('far', 'Last Light');
      await http.post('/launch/routes', {
        commandId: id('route'),
        route: { from: home, to: far },
      });
      await http.post('/launch/starting-settlement', {
        commandId: id('start'),
        settlementId: home,
      });
      const startRolls = await recipe(
        'start',
        { kind: 'starting_settlement', firstLookCount: 1 },
        [20, 45],
      );
      const startRow = (slot: string) => startRolls.results.find((r) => r.slot === slot)!;
      await http.post('/launch/locations', {
        commandId: id('start:first-look'),
        locationId: home,
        location: {
          kind: 'settlement',
          name: 'Cold Harbor',
          location: 'deep_space',
          population: 'Dozens',
          authority: 'None',
          projects: ['Staying alive'],
          firstLooks: [startRow('first_look_1').text],
        },
        groundedIn: [startRow('first_look_1').eventId],
      });

      // Troubles: rolled, the Guide declines to read them, the rolled words kept.
      await refused('trouble:proposal', '/trouble-proposals', {
        kind: 'settlement',
        ownerId: home,
        groundedIn: [startRow('trouble').eventId],
      });
      await http.post('/launch/troubles', {
        commandId: id('trouble:settlement'),
        trouble: { kind: 'settlement', ownerId: home, text: startRow('trouble').text },
        groundedIn: [startRow('trouble').eventId],
      });
      const sectorTrouble = await recipe('trouble:sector', { kind: 'sector_trouble' }, [30]);
      await http.post('/launch/troubles', {
        commandId: id('trouble:sector'),
        trouble: { kind: 'sector', text: sectorTrouble.results[0]!.text },
        groundedIn: sectorTrouble.results.map((r) => r.eventId),
      });

      // The connection: the NPC recipe rolled, the Guide declines, written by hand.
      const npcRolls = await recipe(
        'connection',
        { kind: 'starting_connection' },
        [40, 50, 60, 70, 20, 30],
      );
      await refused('connection:proposal', '/connection-proposals', {
        groundedIn: npcRolls.results.map((r) => r.eventId),
      });
      await http.post('/launch/connection', {
        commandId: id('connection'),
        npcName: 'Hollis Grey',
        role: 'Harbor warden',
        rank: 'dangerous',
        participants: [characterId],
        groundedIn: npcRolls.results.map((r) => r.eventId),
      });

      // The incident: the Guide declines; the incident table is rolled and written up.
      const incidentProposal = await rolling(d100(15, 45, 75), () =>
        http.attempt('POST', '/incident-proposals', { commandId: id('incident:proposal') }),
      );
      expect(incidentProposal.json()).toMatchObject({ ok: false, errorKind: 'not_configured' });
      const incidentRoll = await recipe('incident', { kind: 'inciting_incident' }, [60]);
      await http.post('/launch/incident', {
        commandId: id('incident'),
        incident: { text: `Answer it: ${incidentRoll.results[0]!.text}`, rank: 'dangerous' },
      });
      await http.post('/launch/incident', {
        commandId: id('incident:choices'),
        incident: {
          rollerId: characterId,
          participants: [characterId],
          openingScene: { title: 'Cold Harbor at dusk' },
        },
      });

      const ready = await http.get<LaunchWorkspaceResponse>('/launch');
      expect(ready.readiness.problems).toEqual([]);
      await http.post('/launch/activate', { commandId: id('activate') });

      // The vow's roll does not wait on the Guide (§10).
      const sworn = await rolling(action(5, [3, 4]), () =>
        http.post<{ roll: { tier: string } }>('/moves', {
          commandId: id('swear:move'),
          moveId: 'move:quest/swear-an-iron-vow',
          actorCharacterId: characterId,
          using: { using: 'stat', stat: 'heart' },
          adds: [],
          swearsPendingVow: true,
        }),
      );
      expect(sworn.roll.tier).toBe('strong_hit');

      // Narration pauses rather than commits (D-116).
      const frames = await http.stream('/narrations', {
        commandId: id('swear:narration'),
        afterCommandId: id('swear:move'),
      });
      expect(frames.at(-1)).toMatchObject({ type: 'failed' } satisfies Partial<NarrationFrame>);

      const state = project(await readEvents(db.sql, campaignId));
      expect(state.launch.phase).toBe('active');
      expect(state.launch.activation?.vowTrackId).toBeDefined();
      expect(Object.keys(state.launch.proposals)).toEqual([]);
      expect(state.launch.incidentProposal).toBeUndefined();
      expect(factsBefore.every((type) => ['oracle.rolled', 'ai.failed'].includes(type))).toBe(true);
    } finally {
      await script.close();
    }
  }, 60_000);

  it('fails one proposal without blocking the next manual command, and keeps its rolls', async () => {
    const fixture = 'failing-proposal';
    const campaignId = fixtureUuid<CampaignId>(fixture, 'campaign');
    const failing = new StubProvider({
      responses: [{ kind: 'error', errorKind: 'unavailable', message: 'The Guide is down.' }],
    });
    const script = openScript(db.sql, { fixture, campaignId, provider: failing });
    const { http, id, rolling } = script;
    try {
      await http.root('/campaigns', { campaignId, commandId: id('campaign'), name: 'Flaky' });
      const rolled = await rolling(d100(40, 30, 50), () =>
        http.post<RollLaunchRecipeResponse>('/launch/recipe-rolls', {
          commandId: id('ship:roll'),
          selector: { kind: 'starship', quirkCount: 1 },
        }),
      );
      const proposal = await http.attempt('POST', '/starship-proposals', {
        commandId: id('ship:proposal'),
        groundedIn: rolled.results.map((r) => r.eventId),
      });
      expect(proposal.json()).toMatchObject({ ok: false, errorKind: 'unavailable' });

      // Another section, by hand, straight after.
      await http.post('/launch/foundation', {
        commandId: id('foundation'),
        premise: 'Still going.',
        settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
      });

      const events = await readEvents(db.sql, campaignId);
      const state = project(events);
      expect(state.launch.foundation?.premise).toBe('Still going.');
      // The rolls are the player's still (A42): recorded, and nothing proposed.
      for (const result of rolled.results)
        expect(events.find((event) => event.id === result.eventId)?.type).toBe('oracle.rolled');
      expect(state.launch.proposals).toEqual({});
    } finally {
      await script.close();
    }
  }, 60_000);
});
