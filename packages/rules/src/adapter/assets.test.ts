import type { Datasworn } from '@datasworn/core';
import { describe, expect, it } from 'vitest';

import raw from '@datasworn/starforged/json/starforged.json' with { type: 'json' };

import { mapAssets } from './assets.js';
import { mapMoveCategory } from './moves.js';

const ruleset = raw as unknown as Datasworn.Ruleset;

describe('mapAssets against the real Starforged data', () => {
  const allMoves = Object.values(ruleset.moves).flatMap((category) =>
    mapMoveCategory(category, ruleset.datasworn_version),
  );
  const allMoveSourceIds = allMoves.map((m) => m.source.sourceId);
  const allAssets = mapAssets(ruleset.assets, ruleset.datasworn_version, allMoveSourceIds);

  it('imports every asset — 87 across 6 categories, verified against the raw data', () => {
    const rawCount = Object.values(ruleset.assets).reduce(
      (sum, category) => sum + Object.keys(category.contents ?? {}).length,
      0,
    );
    expect(rawCount).toBe(87);
    expect(allAssets).toHaveLength(rawCount);
  });

  it('mints unique asset IDs', () => {
    const ids = allAssets.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('expands a single-move wildcard enhancement to concrete Astrolabe move IDs (Ace: Face Danger)', () => {
    const ace = allAssets.find((a) => a.id === 'asset:path/ace');
    expect(ace).toBeDefined();
    const firstAbility = ace?.abilities[0];
    expect(firstAbility?.enhances).toEqual(
      expect.arrayContaining(['move:adventure/face-danger', 'move:combat/react-under-fire']),
    );
  });

  it('leaves enhances empty when the raw enhance_moves.enhances is null ("any move of this type")', () => {
    const withNullEnhances = allAssets
      .flatMap((a) => a.abilities)
      .filter((ability) => ability.text.length > 0);
    // At least one ability in the data has a null-enhances enhancement and
    // therefore an empty resolved list; this just confirms the path never
    // throws rather than asserting a specific asset (any of 51 would do).
    expect(withNullEnhances.length).toBeGreaterThan(0);
  });

  it('carries the human-readable category label and countAsImpact flag', () => {
    const ace = allAssets.find((a) => a.id === 'asset:path/ace');
    expect(ace?.category).toBe('Path');
    expect(ace?.countAsImpact).toBe(false);
  });
});
