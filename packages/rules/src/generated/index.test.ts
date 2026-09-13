import { describe, expect, it } from 'vitest';

import { STARFORGED } from './index.js';

/**
 * Confirms the whole pipeline end to end — the committed
 * starforged.json is what scripts/generate-datasworn.ts actually
 * produces, loaded through the same JSON import the package's public API
 * uses, not just through the adapter's functions directly (that's what
 * adapter/*.test.ts already covers against the live @datasworn package).
 */
describe('STARFORGED', () => {
  it('loads the frozen artifact with every Starforged move, oracle, asset and truth', () => {
    expect(STARFORGED.moves).toHaveLength(56);
    expect(STARFORGED.oracles.length).toBeGreaterThan(200);
    expect(STARFORGED.assets).toHaveLength(87);
    expect(STARFORGED.truths).toHaveLength(14);
  });

  it('finds Face Danger by its Astrolabe ID', () => {
    const faceDanger = STARFORGED.moves.find((m) => m.id === 'move:adventure/face-danger');
    expect(faceDanger?.name).toBe('Face Danger');
    expect(faceDanger?.rollType).toBe('action');
  });

  it('carries the game rules constants', () => {
    expect(STARFORGED.gameRules.conditionMeters.map((m) => m.id).sort()).toEqual([
      'health',
      'spirit',
      'supply',
    ]);
  });
});
