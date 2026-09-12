import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';
import type { AssetId, StatId } from '../schema/ids.js';

import {
  STARTING_MOMENTUM,
  STARTING_STAT_ARRAY,
  STAT_IDS,
  isValidCharacterDraft,
  matchesStatArray,
  startingMeters,
  validateCharacterDraft,
  type CharacterDraft,
} from './creation.js';

/** The first three assets the real ruleset ships, so the tests use real ids. */
const REAL_ASSETS = STARFORGED.assets.slice(0, 3).map((asset) => asset.id);

function draft(overrides: Partial<CharacterDraft> = {}): CharacterDraft {
  return {
    name: 'Vesna Kade',
    callsign: 'Vesna',
    stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
    assets: REAL_ASSETS,
    ...overrides,
  };
}

describe('starting values', () => {
  it('assigns stats from one 3, two 2s and two 1s', () => {
    expect([...STARTING_STAT_ARRAY].sort()).toEqual([1, 1, 2, 2, 3]);
    expect(STARTING_STAT_ARRAY).toHaveLength(STAT_IDS.length);
  });

  it('starts momentum at +2', () => {
    expect(STARTING_MOMENTUM).toBe(2);
  });

  it('reads meter starting values and bounds from the imported rules', () => {
    // Grounded in the data rather than hard-coded, so a Datasworn change
    // shows up here rather than drifting silently.
    const meters = startingMeters(STARFORGED.gameRules);
    expect(Object.keys(meters).sort()).toEqual(['health', 'spirit', 'supply']);
    for (const meter of STARFORGED.gameRules.conditionMeters) {
      expect(meters[meter.id]).toEqual({
        value: meter.startingValue,
        min: meter.min,
        max: meter.max,
      });
    }
  });

  it('starts every meter at full', () => {
    const meters = startingMeters(STARFORGED.gameRules);
    expect(meters.health).toEqual({ value: 5, min: 0, max: 5 });
  });
});

describe('matchesStatArray', () => {
  it('accepts the array in any arrangement', () => {
    expect(matchesStatArray({ edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 })).toBe(true);
    expect(matchesStatArray({ edge: 1, heart: 1, iron: 2, shadow: 2, wits: 3 })).toBe(true);
    expect(matchesStatArray({ edge: 2, heart: 1, iron: 3, shadow: 1, wits: 2 })).toBe(true);
  });

  it('rejects an array with the right total but the wrong shape', () => {
    // 9 points either way, but two 3s is not the array.
    expect(matchesStatArray({ edge: 3, heart: 3, iron: 1, shadow: 1, wits: 1 })).toBe(false);
  });

  it('rejects a stat outside the array', () => {
    expect(matchesStatArray({ edge: 4, heart: 2, iron: 1, shadow: 1, wits: 1 })).toBe(false);
    expect(matchesStatArray({ edge: 0, heart: 2, iron: 2, shadow: 2, wits: 3 })).toBe(false);
  });
});

describe('validateCharacterDraft', () => {
  it('accepts a well-formed draft built from real assets', () => {
    expect(validateCharacterDraft(draft(), STARFORGED)).toEqual([]);
    expect(isValidCharacterDraft(draft(), STARFORGED)).toBe(true);
  });

  it('requires a name and a callsign', () => {
    const problems = validateCharacterDraft(draft({ name: '  ', callsign: '' }), STARFORGED);
    expect(problems.map((p) => p.code).sort()).toEqual(['callsign_required', 'name_required']);
  });

  it('rejects a stat array that is not the starting one', () => {
    const problems = validateCharacterDraft(
      draft({
        stats: { edge: 3, heart: 3, iron: 3, shadow: 3, wits: 3 } as Record<StatId, number>,
      }),
      STARFORGED,
    );
    expect(problems[0]?.code).toBe('stat_array_mismatch');
    expect(problems[0]?.field).toBe('stats');
    // The message says what the array is, so a form can show it in place.
    expect(problems[0]?.message).toContain('3, 2, 2, 1, 1');
  });

  it('rejects an asset the ruleset does not have', () => {
    const problems = validateCharacterDraft(
      draft({ assets: ['asset:path/not-a-real-asset' as AssetId] }),
      STARFORGED,
    );
    expect(problems[0]?.code).toBe('unknown_asset');
  });

  it('rejects the same asset chosen twice', () => {
    const first = REAL_ASSETS[0] as AssetId;
    const problems = validateCharacterDraft(draft({ assets: [first, first] }), STARFORGED);
    expect(problems.map((p) => p.code)).toEqual(['duplicate_asset']);
  });

  it('accepts a draft with no assets yet', () => {
    // A half-finished draft is not an error; only writing one is.
    expect(validateCharacterDraft(draft({ assets: [] }), STARFORGED)).toEqual([]);
  });

  it('reports every problem at once, not just the first', () => {
    // A creation form shows all its errors together; stopping at the first
    // would make a player fix five things in five round trips.
    const problems = validateCharacterDraft(
      draft({
        name: '',
        callsign: '',
        stats: { edge: 9, heart: 9, iron: 9, shadow: 9, wits: 9 } as Record<StatId, number>,
        assets: ['asset:path/nope' as AssetId],
      }),
      STARFORGED,
    );
    expect(problems.map((p) => p.code).sort()).toEqual([
      'callsign_required',
      'name_required',
      'stat_array_mismatch',
      'unknown_asset',
    ]);
  });

  it('names the field each problem belongs to', () => {
    const problems = validateCharacterDraft(draft({ name: '' }), STARFORGED);
    expect(problems[0]?.field).toBe('name');
  });
});
