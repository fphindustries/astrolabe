import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';
import type { OracleChainRow } from '../schema/automation.js';
import type { RandomSource } from '../schema/dice.js';
import { resolvePayThePriceChain } from './resolve-pay-the-price-chain.js';

function fixedRandomSource(values: readonly number[]): RandomSource {
  let i = 0;
  return {
    next: () => {
      const value = values[i % values.length];
      i++;
      if (value === undefined) {
        throw new Error('fixedRandomSource exhausted');
      }
      return value;
    },
  };
}

/** next() that lands a 1d100 roll on the given value (1-100). */
function forRoll(roll: number): number {
  return (roll - 1) / 100 + 0.005;
}

const table = STARFORGED.oracles.find((t) => t.id === 'oracle:moves/pay-the-price');
if (table === undefined) {
  throw new Error('fixture table oracle:moves/pay-the-price not found in STARFORGED');
}

const CHAIN_ROWS: readonly OracleChainRow[] = [{ min: 75, max: 81, to: 'move:suffer/endure-harm' }];

describe('resolvePayThePriceChain', () => {
  it('chains to Endure Harm on a roll in the "You are harmed" range (75-81)', () => {
    const rng = fixedRandomSource([forRoll(80)]);
    const steps = resolvePayThePriceChain(rng, table, CHAIN_ROWS);
    expect(steps).toEqual([{ roll: 80, rowText: 'You are harmed', to: 'move:suffer/endure-harm' }]);
  });

  it('produces no chain (narration only, D-67) for a roll outside the mapped rows', () => {
    const rng = fixedRandomSource([forRoll(10)]);
    const steps = resolvePayThePriceChain(rng, table, CHAIN_ROWS);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.to).toBeUndefined();
    expect(steps[0]?.rowText).toBe('You create an opportunity for an enemy');
  });

  it('rolls twice on 96-100 (D-68), producing exactly two steps', () => {
    const rng = fixedRandomSource([forRoll(98), forRoll(80), forRoll(10)]);
    const steps = resolvePayThePriceChain(rng, table, CHAIN_ROWS);
    expect(steps).toEqual([
      { roll: 80, rowText: 'You are harmed', to: 'move:suffer/endure-harm' },
      { roll: 10, rowText: 'You create an opportunity for an enemy', to: undefined },
    ]);
  });

  it('rerolls a nested "Roll twice" once rather than recursing further (D-68)', () => {
    // First roll: 98 -> roll twice. First nested roll: 99 -> roll twice
    // again -> rerolled once to 50 (stands, whatever it is). Second
    // nested roll: 30, a plain result.
    const rng = fixedRandomSource([forRoll(98), forRoll(99), forRoll(50), forRoll(30)]);
    const steps = resolvePayThePriceChain(rng, table, CHAIN_ROWS);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.roll).toBe(50);
    expect(steps[0]?.rowText).not.toBe('Roll twice');
    expect(steps[1]?.roll).toBe(30);
  });

  it('never produces more than two steps, however the dice land', () => {
    // Even if the reroll itself lands on "Roll twice" again, it stands.
    const rng = fixedRandomSource([forRoll(98), forRoll(96), forRoll(97), forRoll(1)]);
    const steps = resolvePayThePriceChain(rng, table, CHAIN_ROWS);
    expect(steps).toHaveLength(2);
  });
});
