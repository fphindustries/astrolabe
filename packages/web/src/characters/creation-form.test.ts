import { describe, expect, it } from 'vitest';

import {
  STARFORGED,
  STARTING_STAT_ARRAY,
  STAT_IDS,
  grantedAssets,
  matchesStatArray,
  validateCharacterDraft,
  type AssetId,
  type CharacterProblem,
} from '@astrolabe/rules';

import {
  CREATION_SLOTS,
  assignStat,
  emptyDraft,
  grantedAssetViews,
  problemsByField,
  slotOptionGroups,
} from './creation-form.js';

describe('emptyDraft', () => {
  it('starts with a valid arrangement of the starting stat array', () => {
    expect(matchesStatArray(emptyDraft().stats)).toBe(true);
  });

  it('is otherwise empty', () => {
    const draft = emptyDraft();
    expect(draft.name).toBe('');
    expect(draft.callsign).toBe('');
    expect(draft.assets).toEqual([]);
  });
});

describe('assignStat', () => {
  it('swaps values so the result is always a valid permutation', () => {
    let stats = emptyDraft().stats;
    for (const statId of STAT_IDS) {
      stats = assignStat(stats, statId, 1);
      expect(matchesStatArray(stats)).toBe(true);
    }
  });

  it('gives the target stat the new value', () => {
    const stats = assignStat(emptyDraft().stats, 'wits', 3);
    expect(stats.wits).toBe(3);
  });

  it('moves the displaced stat to hold whatever the target gave up', () => {
    const before = emptyDraft().stats; // edge=3, heart=2, iron=2, shadow=1, wits=1
    const after = assignStat(before, 'wits', 3);
    // wits took edge's 3, so edge should now hold wits' old value (1).
    expect(after.edge).toBe(1);
  });

  it('never produces a set outside the starting array', () => {
    const stats = assignStat(emptyDraft().stats, 'edge', 1);
    expect([...Object.values(stats)].sort()).toEqual([...STARTING_STAT_ARRAY].sort());
  });
});

describe('problemsByField', () => {
  it('groups messages under their field and leaves the rest empty', () => {
    const problems: readonly CharacterProblem[] = [
      { code: 'name_required', field: 'name', message: 'A character needs a name.' },
      { code: 'callsign_required', field: 'callsign', message: 'A character needs a callsign.' },
    ];
    const grouped = problemsByField(problems);
    expect(grouped.name).toEqual(['A character needs a name.']);
    expect(grouped.callsign).toEqual(['A character needs a callsign.']);
    expect(grouped.stats).toEqual([]);
    expect(grouped.assets).toEqual([]);
  });
});

describe('slotOptionGroups', () => {
  it('offers only assets whose category the slot allows, grouped by category', () => {
    const pathSlot = CREATION_SLOTS.find((slot) => slot.id === 'path_1');
    if (pathSlot === undefined) throw new Error('expected a path_1 slot');

    const groups = slotOptionGroups(pathSlot, STARFORGED);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.category.id).toBe('path');
    expect(groups[0]?.assets.every((asset) => asset.categoryId === 'path')).toBe(true);
    expect(groups[0]?.assets.length).toBeGreaterThan(0);
  });

  it("the final slot's groups match its allowed categories", () => {
    const finalSlot = CREATION_SLOTS.find((slot) => slot.id === 'final');
    if (finalSlot === undefined) throw new Error('expected a final slot');

    const groups = slotOptionGroups(finalSlot, STARFORGED);
    expect(groups.map((group) => group.category.id).sort()).toEqual([...finalSlot.allows].sort());
  });
});

describe('grantedAssetViews', () => {
  it('resolves the granted asset ids to names', () => {
    const grantedIds = grantedAssets(STARFORGED);
    const views = grantedAssetViews(STARFORGED, grantedIds);
    expect(views).toHaveLength(grantedIds.length);
    expect(views.every((view) => view.name.length > 0)).toBe(true);
  });

  it('falls back to the id for an unknown asset', () => {
    const views = grantedAssetViews(STARFORGED, ['asset:nonexistent' as AssetId]);
    expect(views).toEqual([{ id: 'asset:nonexistent', name: 'asset:nonexistent' }]);
  });
});

describe('a filled-in draft built from these helpers validates cleanly', () => {
  it('produces no problems once every slot is filled', () => {
    const paths = STARFORGED.assets.filter((asset) => asset.categoryId === 'path');
    const draft = {
      name: 'Vesna Kade',
      callsign: 'Vesna',
      stats: emptyDraft().stats,
      assets: paths.slice(0, 3).map((asset) => asset.id),
    };
    expect(validateCharacterDraft(draft, STARFORGED)).toEqual([]);
  });
});
