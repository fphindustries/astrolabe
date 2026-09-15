import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';
import { rollOracle } from './oracle-roll.js';
import { createSeededRandomSource } from './rng.js';

describe('rollOracle', () => {
  const action = STARFORGED.oracles.find((t) => t.id === 'oracle:core/action');
  if (action === undefined) {
    throw new Error('fixture table oracle:core/action not found in STARFORGED');
  }

  it('resolves against the real Action table without throwing, whatever the roll', () => {
    const rng = createSeededRandomSource(1);
    const result = rollOracle(rng, action);
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(100);
    expect(typeof result.row.text).toBe('string');
    expect(result.row.text.length).toBeGreaterThan(0);
  });

  it('is deterministic under a seeded source', () => {
    const a = rollOracle(createSeededRandomSource(777), action);
    const b = rollOracle(createSeededRandomSource(777), action);
    expect(a).toEqual(b);
  });

  it('carries text2 through for a two-column table', () => {
    const table = {
      ...action,
      dice: '1d100',
      rows: [{ min: 1, max: 100, text: 'Primary', text2: 'Secondary' }],
    };
    const result = rollOracle(createSeededRandomSource(1), table);
    expect(result.row).toEqual({ text: 'Primary', text2: 'Secondary' });
  });

  it('omits text2 when the row has none', () => {
    const table = {
      ...action,
      dice: '1d100',
      rows: [{ min: 1, max: 100, text: 'Only one column' }],
    };
    const result = rollOracle(createSeededRandomSource(1), table);
    expect(result.row).toEqual({ text: 'Only one column' });
  });

  it('throws rather than silently returning nothing when no row covers the roll', () => {
    const emptyTable = { ...action, dice: '1d100', rows: [] };
    expect(() => rollOracle(createSeededRandomSource(1), emptyTable)).toThrow();
  });

  it('never throws across every table Datasworn actually ships', () => {
    const rng = createSeededRandomSource(2024);
    for (const table of STARFORGED.oracles) {
      // A handful of rolls per table is enough to sample its range without
      // this test taking meaningfully longer; the real guarantee is
      // structural (rows fully tile every value the die can produce),
      // checked exhaustively in the next test.
      for (let i = 0; i < 5; i++) {
        expect(() => rollOracle(rng, table)).not.toThrow();
      }
    }
  });

  it('has exactly one covering row for every value the table’s die can produce', () => {
    const sidesFor: Record<string, number> = { '1d100': 100, '1d20': 20, '1d10': 10 };
    for (const table of STARFORGED.oracles) {
      const sides = sidesFor[table.dice];
      expect(
        sides,
        `table ${table.id} has an unrecognised dice expression "${table.dice}"`,
      ).toBeDefined();
      for (let value = 1; value <= (sides as number); value++) {
        const covering = table.rows.filter((r) => value >= r.min && value <= r.max);
        expect(covering.length, `table ${table.id} at roll ${value}`).toBe(1);
      }
    }
  });
});
