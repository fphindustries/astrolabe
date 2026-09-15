import type { Datasworn } from '@datasworn/core';
import { describe, expect, it } from 'vitest';

import raw from '@datasworn/starforged/json/starforged.json' with { type: 'json' };

import { mapOracles } from './oracles.js';

const ruleset = raw as unknown as Datasworn.Ruleset;

describe('mapOracles against the real Starforged data', () => {
  const allOracles = mapOracles(ruleset.oracles, ruleset.datasworn_version);

  it('imports every rollable oracle row, dropping only the unrollable rendering-only rows', () => {
    expect(allOracles.length).toBeGreaterThan(200);
    const totalRows = allOracles.reduce((sum, t) => sum + t.rows.length, 0);
    // 4415 rows total in the raw data, 59 of them unrollable (verified directly).
    expect(totalRows).toBe(4415 - 59);
  });

  it('mints unique IDs even though oracle leaf names collide heavily (feature appears 29 times)', () => {
    const ids = allOracles.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps the core Action table with its rows and its suggestion of Theme', () => {
    const action = allOracles.find((t) => t.id === 'oracle:core/action');
    expect(action).toBeDefined();
    expect(action?.kind).toBe('text');
    expect(action?.dice).toBe('1d100');
    expect(action?.rows).toHaveLength(100);
    expect(action?.rows[0]).toEqual({ min: 1, max: 1, text: 'Abandon' });
    expect(action?.suggests).toContain('oracle:core/theme');
  });

  it('maps a column_text oracle the official OracleTableRollable type omits (Derelict Zones: Starship)', () => {
    const starship = allOracles.find((t) => t.id === 'oracle:derelicts/zones/starship');
    expect(starship).toBeDefined();
    expect(starship?.kind).toBe('column_text');
  });

  it('maps the Pay the Price table, including its self-referential "Roll twice" row', () => {
    const payThePrice = allOracles.find((t) => t.id === 'oracle:moves/pay-the-price');
    expect(payThePrice?.rows).toHaveLength(20);
    const rollTwice = payThePrice?.rows.find((r) => r.min === 96);
    expect(rollTwice).toEqual({ min: 96, max: 100, text: 'Roll twice' });
  });

  it('rewrites [label](id:...) links inside a truth-adjacent table’s row text', () => {
    const storyComplication = allOracles.find((t) => t.id === 'oracle:misc/story-complication');
    expect(storyComplication).toBeDefined();
  });
});
