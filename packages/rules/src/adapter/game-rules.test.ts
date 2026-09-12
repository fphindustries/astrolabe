import type { Datasworn } from '@datasworn/core';
import { describe, expect, it } from 'vitest';

import raw from '@datasworn/starforged/json/starforged.json' with { type: 'json' };

import { mapGameRules } from './game-rules.js';

const ruleset = raw as unknown as Datasworn.Ruleset;

describe('mapGameRules against the real Starforged data', () => {
  const gameRules = mapGameRules(ruleset.rules);

  it('maps all three condition meters with their bounds', () => {
    expect(gameRules.conditionMeters).toEqual([
      { id: 'health', label: 'health', min: 0, max: 5, startingValue: 5 },
      { id: 'spirit', label: 'spirit', min: 0, max: 5, startingValue: 5 },
      { id: 'supply', label: 'supply', min: 0, max: 5, startingValue: 5 },
    ]);
  });

  it('maps all 10 impacts across 4 categories with no ID collisions', () => {
    expect(gameRules.impacts).toHaveLength(10);
    const ids = gameRules.impacts.map((i) => i.id);
    expect(new Set(ids).size).toBe(10);
    expect(gameRules.impacts).toContainEqual({
      id: 'impact:wounded',
      category: 'misfortunes',
      label: 'wounded',
    });
  });

  it('maps the 3 Starforged special (legacy) tracks', () => {
    expect(gameRules.specialTracks.map((t) => t.id)).toEqual([
      'quests_legacy',
      'bonds_legacy',
      'discoveries_legacy',
    ]);
  });
});
