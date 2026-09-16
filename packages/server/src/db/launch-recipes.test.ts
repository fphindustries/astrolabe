import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS,
  STARFORGED,
  materializeLaunchRecipe,
  type LaunchRecipeSelector,
} from '@astrolabe/rules';
import { LOCAL_PLAYER_ID, type Actor, type CampaignId, type CommandId } from '@astrolabe/shared';

import { loadedDice } from '../fixtures/loaded-dice.js';

import { createCampaign } from './campaign-commands.js';
import { readEvents } from './event-store.js';
import { rollLaunchRecipe } from './launch-commands.js';
import { createTestDatabase, hasTestDatabase, type TestDatabase } from './testing.js';
import { uuidv7 } from './uuid.js';

/**
 * Task 3R.5: the server rolls a *declared* recipe before the Guide
 * interprets it (D-65, D-166, D-173).
 *
 * The recipes were declared in task 1.3 and then imported by nothing but
 * their own test, because no task in groups 3–9 owned wiring them in. The
 * launch roll endpoint took an oracle id from the caller instead, which is
 * the opposite of what D-65 asks for: the caller chose the table.
 */

const PLAYER: Actor = { kind: 'player', playerId: LOCAL_PLAYER_ID };
const newId = <T>() => uuidv7() as T;

/** Enough faces for any recipe here; each slot draws one d100. */
const dice = () =>
  loadedDice(Array.from({ length: 40 }, () => ({ sides: 100, face: 50 }) as const));

describe.skipIf(!hasTestDatabase)('rolling a declared launch recipe (3.4, 3.5, D-65)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('launch_recipes');
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  async function campaign(): Promise<CampaignId> {
    const { campaignId } = await createCampaign(db.sql, {
      campaignId: newId<CampaignId>(),
      commandId: newId<CommandId>(),
      actor: PLAYER,
      name: 'Lantern Wake',
    });
    return campaignId;
  }

  async function roll(campaignId: CampaignId, selector: LaunchRecipeSelector) {
    const result = await rollLaunchRecipe(db.sql, {
      campaignId,
      commandId: newId<CommandId>(),
      actor: PLAYER,
      selector,
      rng: dice(),
    });
    return result.response as {
      recipeId: string;
      results: readonly { eventId: string; slot: string; oracleId: string; text: string }[];
    };
  }

  it('rolls every slot of the starship recipe and records each as its own chip', async () => {
    const campaignId = await campaign();

    const response = await roll(campaignId, { kind: 'starship', quirkCount: 2 });

    expect(response.recipeId).toBe('recipe:campaign-launch/starship/2');
    expect(response.results.map((result) => result.slot)).toEqual([
      'name',
      'history',
      'quirk_1',
      'quirk_2',
    ]);

    // Each result is a real `oracle.rolled` the player can see and a proposal
    // can cite (A41).
    const rolls = (await readEvents(db.sql, campaignId)).filter(
      (event) => event.type === 'oracle.rolled',
    );
    expect(rolls).toHaveLength(4);
    expect(rolls.map((event) => event.id)).toEqual(response.results.map((r) => r.eventId));
    for (const result of response.results) expect(result.text).not.toBe('');
  });

  it('parameterizes the settlement recipe by region and project count (D-173)', async () => {
    const campaignId = await campaign();

    const outlands = await roll(campaignId, {
      kind: 'settlement',
      region: 'outlands',
      projectCount: 1,
    });

    expect(outlands.recipeId).toBe('recipe:campaign-launch/settlement/outlands/1');
    expect(outlands.results.map((r) => r.slot)).toEqual([
      'name',
      'location',
      'population',
      'authority',
      'project_1',
    ]);
    // The population table is the region's own, not a generic one.
    expect(outlands.results.find((r) => r.slot === 'population')?.oracleId).toBe(
      'oracle:settlements/population/outlands',
    );
  });

  it('rolls a planet only to the depth asked for (A33)', async () => {
    const campaignId = await campaign();

    const shallow = await roll(campaignId, {
      kind: 'planet',
      planetClass: 'vital',
      depth: 'shallow',
    });
    const detailed = await roll(campaignId, {
      kind: 'planet',
      planetClass: 'vital',
      depth: 'starting_detail',
    });

    expect(shallow.results.map((r) => r.slot)).toEqual(['name']);
    expect(detailed.results.map((r) => r.slot)).toEqual([
      'atmosphere',
      'observed_from_space',
      'feature',
    ]);
  });

  it('rolls the fixed connection, trouble and incident recipes', async () => {
    const campaignId = await campaign();

    expect((await roll(campaignId, { kind: 'starting_connection' })).recipeId).toBe(
      'recipe:campaign-launch/connection',
    );
    expect((await roll(campaignId, { kind: 'sector_trouble' })).results).toHaveLength(1);
    expect((await roll(campaignId, { kind: 'inciting_incident' })).results).toHaveLength(1);
  });
});

describe('every declared materialization is rollable', () => {
  it('names only oracles that exist in the frozen rules data', () => {
    const ids = new Set(STARFORGED.oracles.map((oracle) => oracle.id));

    for (const recipe of CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS)
      for (const slot of recipe.rolls) expect(ids.has(slot.oracle)).toBe(true);
  });

  it('materializes every selector to a declared recipe, and nothing else', () => {
    const declared = new Set(CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS.map((recipe) => recipe.id));
    const selectors: LaunchRecipeSelector[] = [
      { kind: 'starship', quirkCount: 1 },
      { kind: 'starship', quirkCount: 2 },
      { kind: 'settlement', region: 'terminus', projectCount: 2 },
      { kind: 'planet', planetClass: 'grave', depth: 'shallow' },
      { kind: 'planet', planetClass: 'grave', depth: 'starting_detail' },
      { kind: 'starting_connection' },
      { kind: 'sector_trouble' },
      { kind: 'inciting_incident' },
    ];

    for (const selector of selectors)
      expect(declared.has(materializeLaunchRecipe(selector).id)).toBe(true);
  });
});
