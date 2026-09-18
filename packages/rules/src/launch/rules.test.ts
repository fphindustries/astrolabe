import { describe, expect, it } from 'vitest';
import { STARFORGED } from '../generated/index.js';
import {
  buildSettlementRecipe,
  buildStarshipRecipe,
  CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS,
} from '../recipes/index.js';
import { REGION_BASELINES, validateLaunchReadiness } from './rules.js';

describe('Campaign Launch rules', () => {
  it('uses the Starforged starting-sector baselines', () =>
    expect(REGION_BASELINES).toMatchObject({
      terminus: { settlements: 4, passages: 3 },
      outlands: { settlements: 3, passages: 2 },
      expanse: { settlements: 2, passages: 1 },
    }));
  it('materializes only recipes backed by imported tables', () => {
    const ids = new Set(STARFORGED.oracles.map((oracle) => oracle.id));
    for (const recipe of CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS)
      for (const slot of recipe.rolls) expect(ids.has(slot.oracle)).toBe(true);
    expect(buildStarshipRecipe(2).rolls).toHaveLength(4);
    expect(buildSettlementRecipe('outlands', 2).rolls).toHaveLength(6);
  });
  it('reports missing launch facts without treating a truth omission as open', () => {
    const result = validateLaunchReadiness(
      { campaignName: 'Test', draftedSections: [], truths: [], characters: [] },
      STARFORGED.truths,
      STARFORGED,
    );
    expect(result.ready).toBe(false);
    expect(result.problems.some((problem) => problem.code === 'truth_missing')).toBe(true);
    expect(result.sections.truths.status).toBe('not_started');
  });
});
