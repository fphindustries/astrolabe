import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { STARFORGED, type CharacterId } from '@astrolabe/rules';
import type {
  CreateCampaignResponse,
  CreateCharacterResponse,
  EntityId,
  LaunchWorkspaceResponse,
  RollLaunchRecipeResponse,
  SaveSharedStarshipResponse,
} from '@astrolabe/shared';

import { StubProvider } from '../ai/stub.js';
import { FIXTURES, seedFixture } from '../fixtures/index.js';
import { GOLDEN_SESSION } from '../fixtures/golden-session.js';
import { SESSION_ONE } from '../fixtures/session-one.js';
import { SESSION_TWO_OPEN } from '../fixtures/session-two-open.js';
import { loadedDice } from '../fixtures/loaded-dice.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../db/testing.js';

import { buildApp } from './app.js';

/**
 * Task 3R.7g: the Campaign Launch routes over HTTP.
 *
 * Group 3 added roughly twenty of them and no test exercised any, so nothing
 * checked that a body schema matches the command behind it, that a rejected
 * command becomes a 422 rather than a 500, or that the rolling routes thread
 * the injected dice (D-152) the golden launch will need.
 */

const paths = STARFORGED.assets
  .filter((asset) => asset.categoryId === 'path')
  .slice(0, 3)
  .map((asset) => asset.id);
const starshipAsset = STARFORGED.assets.find((asset) => asset.categoryId === 'command_vehicle')!.id;

describe.skipIf(!hasTestDatabase)('the Campaign Launch routes (3.1–3.9)', () => {
  let db: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDatabase('launch_routes');
    app = buildApp({
      sql: db.sql,
      ai: new StubProvider(),
      checker: new StubProvider(),
      // Every face a recipe roll here needs; D-152's injected dice.
      rng: loadedDice(Array.from({ length: 200 }, () => ({ sides: 100, face: 50 }) as const)),
    });
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  const post = (url: string, body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url, payload: body });
  // Saving a resumable draft and moving a map node are idempotent replacements
  // of what is already there, so they are PUT rather than POST.
  const put = (url: string, body: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url, payload: body });
  const newId = () => crypto.randomUUID();

  async function campaign(): Promise<string> {
    const created = await post('/api/campaigns', {
      campaignId: crypto.randomUUID(),
      commandId: newId(),
      name: 'Lantern Wake',
    });
    return (created.json() as CreateCampaignResponse).campaignId;
  }

  it('reports the launch workspace, with readiness beside the state (D-176)', async () => {
    const id = await campaign();

    const response = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` });

    expect(response.statusCode).toBe(200);
    const body = response.json() as LaunchWorkspaceResponse;
    expect(body.state.launch.phase).toBe('draft');
    // Statuses are returned beside the state, not folded into it.
    expect(body.readiness.ready).toBe(false);
    expect(Object.keys(body.readiness.sections).sort()).toEqual([
      'connection_troubles',
      'crew',
      'foundation',
      'incident_launch',
      'sector',
      'starship',
      'truths',
    ]);
  });

  it('serves the workspace for a Milestone 1 fixture, closed rather than broken (A43, D-178)', async () => {
    // 4.4 makes this endpoint the front door for *every* campaign open, active
    // and legacy ones included. It runs the launch validator over characters
    // created under the Milestone 1 rules — which carry the per-character
    // Starship grant D-171 makes invalid for a launch — so the thing worth
    // asserting is that a legacy campaign yields *blockers and a closed
    // workspace*, not a 500. 3R.10b proved these campaigns refuse launch
    // commands; nothing proved the launch read survives them.
    for (const name of [SESSION_ONE, SESSION_TWO_OPEN, GOLDEN_SESSION]) {
      const fixture = FIXTURES.get(name)!;
      await seedFixture(db.sql, name);

      const response = await app.inject({
        method: 'GET',
        url: `/api/campaigns/${fixture.campaignId}/launch`,
      });

      expect(response.statusCode, name).toBe(200);
      const body = response.json() as LaunchWorkspaceResponse;
      expect({ name, ...body }).toMatchObject({
        launchOpen: false,
        closedReason: 'campaign_in_play',
      });
      // The phase alone would have said `draft` and sent A43 to the wrong screen.
      expect(body.state.launch.phase, name).toBe('draft');
    }
  });

  it('404s the workspace for a campaign that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${crypto.randomUUID()}/launch`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('saves a draft and returns it on the next read (A23)', async () => {
    const id = await campaign();

    const saved = await put(`/api/campaigns/${id}/launch/drafts`, {
      commandId: newId(),
      draft: { section: 'foundation', snapshot: { premise: 'A signal past the Drift.' } },
    });

    expect(saved.statusCode).toBe(201);
    const workspace = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` });
    expect((workspace.json() as LaunchWorkspaceResponse).state.launch.drafts.foundation).toEqual({
      snapshot: { premise: 'A signal past the Drift.' },
      seq: expect.any(Number),
    });
  });

  it('orders a draft against its accepted fact over the wire (D-182)', async () => {
    const id = await campaign();
    await put(`/api/campaigns/${id}/launch/drafts`, {
      commandId: newId(),
      draft: { section: 'foundation', snapshot: { premise: 'Drafted words.' } },
    });
    await post(`/api/campaigns/${id}/launch/foundation`, {
      commandId: newId(),
      premise: 'The words actually accepted.',
      settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
    });

    const workspace = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` });
    const launch = (workspace.json() as LaunchWorkspaceResponse).state.launch;

    // The client's whole precedence rule rests on these two numbers being
    // comparable at the layer it reads them, not just inside the fold: this is
    // the sequence where a form that simply prefers its draft would show
    // "Drafted words." beside a section the same payload reports complete.
    expect(launch.foundation!.seq).toBeGreaterThan(launch.drafts.foundation!.seq);
  });

  it('rolls a declared recipe through the injected dice (D-65, D-152)', async () => {
    const id = await campaign();

    const response = await post(`/api/campaigns/${id}/launch/recipe-rolls`, {
      commandId: newId(),
      selector: { kind: 'starship', quirkCount: 2 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as RollLaunchRecipeResponse;
    expect(body.recipeId).toBe('recipe:campaign-launch/starship/2');
    expect(body.results).toHaveLength(4);
    // Loaded dice, so the result is the same every run: the route really does
    // pass the injected source down rather than reaching for crypto.
    expect(new Set(body.results.map((result) => result.text)).size).toBeGreaterThan(0);
    for (const result of body.results) expect(result.roll).toBe(50);
  });

  // 7.0a — a body naming its own id, asset or integrity does not get them.
  it('saves the starship with a server-minted id and the rules asset and integrity', async () => {
    const id = await campaign();
    const clientId = newId();

    const response = await post(`/api/campaigns/${id}/launch/starship`, {
      commandId: newId(),
      starship: {
        starshipId: clientId,
        name: 'Lantern Wake',
        appearance: 'Old freighter, patched hull',
        history: 'Won in a wager',
        quirks: ['The clocks run slow'],
        integrity: { value: 9, min: 0, max: 99 },
        assetId: 'asset:module/sensor-array',
        modules: [],
      },
    });

    expect(response.statusCode).toBe(201);
    const { starshipId } = response.json() as SaveSharedStarshipResponse;
    expect(starshipId).not.toBe(clientId);
    const workspace = (
      await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` })
    ).json() as LaunchWorkspaceResponse;
    expect(workspace.state.launch.starship).toMatchObject({
      starshipId,
      assetId: starshipAsset,
      integrity: { value: 5, min: 0, max: 5 },
    });
  });

  // 7.0e — the Guide's ship, over HTTP: 201 with rolls, 422 without them.
  it('asks the Guide for a ship grounded in a recipe roll, and refuses one without', async () => {
    const id = await campaign();
    const rolled = (
      await post(`/api/campaigns/${id}/launch/recipe-rolls`, {
        commandId: newId(),
        selector: { kind: 'starship', quirkCount: 2 },
      })
    ).json() as RollLaunchRecipeResponse;
    const eventIds = rolled.results.map((result) => result.eventId);

    const asked = await post(`/api/campaigns/${id}/starship-proposals`, {
      commandId: newId(),
      groundedIn: eventIds,
    });
    expect(asked.statusCode).toBe(201);

    const refused = await post(`/api/campaigns/${id}/starship-proposals`, {
      commandId: newId(),
      groundedIn: eventIds.slice(0, 1),
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ reason: 'no_rolls' });
  });

  it('rejects a body the schema does not accept with 400, not 500', async () => {
    const id = await campaign();

    const response = await post(`/api/campaigns/${id}/launch/recipe-rolls`, {
      commandId: newId(),
      selector: { kind: 'starship', quirkCount: 7 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('turns a refused command into 422 with its reason', async () => {
    const id = await campaign();

    const response = await post(`/api/campaigns/${id}/launch/sector`, {
      commandId: newId(),
      sector: {
        sectorId: crypto.randomUUID(),
        name: 'Lantern Reach',
        region: 'expanse',
        baseline: { settlements: 4, passages: 3 },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ reason: 'invalid_sector_baseline' });
  });

  it('decides a truth, rolling server-side when asked (A26)', async () => {
    const id = await campaign();
    const truth = STARFORGED.truths[0]!;

    const picked = await post(`/api/campaigns/${id}/launch/truths`, {
      commandId: newId(),
      truthId: truth.id,
      resolution: 'leave_open',
    });

    expect(picked.statusCode).toBe(201);
    const workspace = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` });
    const state = (workspace.json() as LaunchWorkspaceResponse).state;
    expect(state.launch.truthDecisions[truth.id]).toMatchObject({ resolution: 'leave_open' });
  });

  it('serves a rolled truth’s oracle rolls as chips (A41)', async () => {
    // The chips are computed beside the state; this is the assertion that they
    // reach the wire. Without it, a client that never reads them loses every
    // chip with nothing failing — the launch-state read model has been written
    // and unread twice already in this milestone.
    const id = await campaign();
    const truth = STARFORGED.truths[0]!;

    const rolled = await post(`/api/campaigns/${id}/launch/truths`, {
      commandId: newId(),
      truthId: truth.id,
      resolution: 'rolled',
    });
    expect(rolled.statusCode).toBe(201);

    const workspace = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` });
    const body = workspace.json() as LaunchWorkspaceResponse;
    const decision = body.state.launch.truthDecisions[truth.id];

    // Cataclysm's every option has a nested table, so rolling it cites two.
    expect(decision?.groundedIn.length).toBeGreaterThan(0);
    for (const rollId of decision?.groundedIn ?? []) {
      expect(body.chips[rollId]).toMatchObject({ eventId: rollId, voided: false });
      expect(typeof body.chips[rollId]?.roll).toBe('number');
    }
  });

  it('creates a launch character without the command-vehicle grant (D-171)', async () => {
    const id = await campaign();

    const response = await post(`/api/campaigns/${id}/launch/crew`, {
      commandId: newId(),
      draft: {
        name: 'Vesna Kade',
        callsign: 'Map',
        stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        assets: paths,
      },
      backgroundVow: { title: 'Find the lost colony', rank: 'formidable' },
      launch: { appearance: 'Weathered jacket', backstory: { kind: 'discover_in_play' } },
    });

    expect(response.statusCode).toBe(201);
    const { characterId } = response.json() as CreateCharacterResponse;
    const workspace = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` });
    const character = (workspace.json() as LaunchWorkspaceResponse).state.characters[characterId];
    expect(character?.assets).not.toContain(starshipAsset);
  });

  it('rejects a launch character with no background vow at the schema (D-163)', async () => {
    const id = await campaign();

    const response = await post(`/api/campaigns/${id}/launch/crew`, {
      commandId: newId(),
      draft: {
        name: 'Vesna Kade',
        callsign: 'Map',
        stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        assets: paths,
      },
      // The body schema requires it, so this never reaches the command: 400,
      // not 422. Both are refusals; which one tells you where the rule lives.
      launch: { appearance: 'Weathered jacket', backstory: { kind: 'discover_in_play' } },
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a schema-valid but rules-invalid asset set with 422 (A28, D-171)', async () => {
    const id = await campaign();

    const response = await post(`/api/campaigns/${id}/launch/crew`, {
      commandId: newId(),
      draft: {
        name: 'Vesna Kade',
        callsign: 'Map',
        stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        // A well-formed list the rules reject: the command-vehicle asset is
        // not a character's to take under D-171.
        assets: [...paths.slice(0, 2), starshipAsset],
      },
      backgroundVow: { title: 'Find the lost colony', rank: 'formidable' },
      launch: { appearance: 'Weathered jacket', backstory: { kind: 'discover_in_play' } },
    });

    expect(response.statusCode).toBe(422);
  });

  it('refuses to activate a campaign that is not ready (A38)', async () => {
    const id = await campaign();

    const response = await post(`/api/campaigns/${id}/launch/activate`, { commandId: newId() });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ reason: 'not_ready' });
  });

  it('saves the sector graph through its own routes (A31–A35)', async () => {
    const id = await campaign();
    await post(`/api/campaigns/${id}/launch/sector`, {
      commandId: newId(),
      sector: {
        sectorId: crypto.randomUUID(),
        name: 'Lantern Reach',
        region: 'expanse',
        baseline: { settlements: 2, passages: 1 },
      },
    });
    const ember = crypto.randomUUID() as EntityId;

    const location = await post(`/api/campaigns/${id}/launch/locations`, {
      commandId: newId(),
      location: {
        kind: 'settlement',
        id: ember,
        name: 'Ember Hold',
        location: 'deep_space',
        population: 'Hundreds',
        authority: 'Corporate',
        projects: ['Rebuilding the relay'],
      },
    });
    const route = await post(`/api/campaigns/${id}/launch/routes`, {
      commandId: newId(),
      route: { from: ember, to: { kind: 'off_map', label: 'The Drift' } },
    });
    const layout = await put(`/api/campaigns/${id}/launch/sector-layout`, {
      commandId: newId(),
      coordinates: { [ember]: { x: 4, y: 9 } },
    });
    const start = await post(`/api/campaigns/${id}/launch/starting-settlement`, {
      commandId: newId(),
      settlementId: ember,
    });

    for (const response of [location, route, layout, start]) expect(response.statusCode).toBe(201);

    const state = (
      (
        await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` })
      ).json() as LaunchWorkspaceResponse
    ).state;
    expect(state.launch.startingSettlementId).toBe(ember);
    expect(state.launch.layout[ember]).toEqual({ x: 4, y: 9 });
    expect(state.launch.routes).toHaveLength(1);
  });

  describe('revising and removing a crew member over HTTP (6.0d)', () => {
    const CREW_BODY = {
      draft: {
        name: 'Vesna Kade',
        callsign: 'Map',
        stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        assets: paths,
      },
      backgroundVow: { title: 'Find the lost colony', rank: 'formidable' },
      launch: { appearance: 'Weathered jacket', backstory: { kind: 'discover_in_play' } },
    } as const;

    const del = (url: string, body: Record<string, unknown>) =>
      app.inject({ method: 'DELETE', url, payload: body });

    async function crew(): Promise<{ id: string; characterId: CharacterId }> {
      const id = await campaign();
      const created = await post(`/api/campaigns/${id}/launch/crew`, {
        commandId: newId(),
        ...CREW_BODY,
      });
      return { id, characterId: (created.json() as CreateCharacterResponse).characterId };
    }

    it('revises a crew member in place', async () => {
      const { id, characterId } = await crew();

      const response = await put(`/api/campaigns/${id}/launch/crew/${characterId}`, {
        commandId: newId(),
        ...CREW_BODY,
        launch: { ...CREW_BODY.launch, appearance: 'A quieter jacket' },
      });

      expect(response.statusCode).toBe(200);
      const workspace = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` });
      const state = (workspace.json() as LaunchWorkspaceResponse).state;
      expect(state.characters[characterId]?.appearance).toBe('A quieter jacket');
      expect(state.launch.crewHistory[characterId]).toHaveLength(1);
    });

    it('removes a crew member, and says why in the log', async () => {
      const { id, characterId } = await crew();

      const response = await del(`/api/campaigns/${id}/launch/crew/${characterId}`, {
        commandId: newId(),
        reason: 'Replaced by a different concept.',
      });

      expect(response.statusCode).toBe(200);
      const workspace = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/launch` });
      const state = (workspace.json() as LaunchWorkspaceResponse).state;
      expect(state.characters[characterId]).toBeUndefined();
      expect(state.launch.crewHistory[characterId]).toHaveLength(1);
    });

    it('answers 404 for a character the campaign does not have', async () => {
      const id = await campaign();

      const revised = await put(`/api/campaigns/${id}/launch/crew/${crypto.randomUUID()}`, {
        commandId: newId(),
        ...CREW_BODY,
      });
      const removed = await del(`/api/campaigns/${id}/launch/crew/${crypto.randomUUID()}`, {
        commandId: newId(),
        reason: 'Never existed.',
      });

      expect(revised.statusCode).toBe(404);
      expect(removed.statusCode).toBe(404);
    });

    it('answers 400 for a malformed character id and 400 for a removal with no reason', async () => {
      const { id, characterId } = await crew();

      expect(
        (
          await put(`/api/campaigns/${id}/launch/crew/not-a-uuid`, {
            commandId: newId(),
            ...CREW_BODY,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await del(`/api/campaigns/${id}/launch/crew/${characterId}`, { commandId: newId() }))
          .statusCode,
      ).toBe(400);
    });

    it('refuses a rules-invalid revision with 422, not 500', async () => {
      const { id, characterId } = await crew();

      const response = await put(`/api/campaigns/${id}/launch/crew/${characterId}`, {
        commandId: newId(),
        ...CREW_BODY,
        // Three paths and nothing else is a legal creation set; a deed is not.
        draft: { ...CREW_BODY.draft, assets: [...paths, starshipAsset] },
      });

      expect(response.statusCode).toBe(422);
    });

    it('refuses both on a campaign already in play (D-178)', async () => {
      const fixture = FIXTURES.get(SESSION_ONE)!;
      await seedFixture(db.sql, SESSION_ONE);
      const characterId = (
        Object.keys(
          (
            (
              await app.inject({
                method: 'GET',
                url: `/api/campaigns/${fixture.campaignId}/launch`,
              })
            ).json() as LaunchWorkspaceResponse
          ).state.characters,
        ) as CharacterId[]
      )[0]!;

      const revised = await put(`/api/campaigns/${fixture.campaignId}/launch/crew/${characterId}`, {
        commandId: newId(),
        ...CREW_BODY,
      });
      const removed = await del(`/api/campaigns/${fixture.campaignId}/launch/crew/${characterId}`, {
        commandId: newId(),
        reason: 'Not allowed.',
      });

      expect(revised.statusCode).toBe(422);
      expect(revised.json()).toMatchObject({ reason: 'campaign_in_play' });
      expect(removed.statusCode).toBe(422);
    });
  });
});
