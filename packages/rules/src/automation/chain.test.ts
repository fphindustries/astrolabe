import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';
import type { RandomSource } from '../schema/dice.js';
import { resolveActionMove } from './resolve-action-move.js';
import { resolveMethodOption } from './resolve-method.js';
import { resolvePayThePriceChain } from './resolve-pay-the-price-chain.js';
import { endureHarm, faceDanger, payThePrice } from './specs/index.js';

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

/**
 * Task 1.9: the chained-moves integration test CLAUDE.md's testing
 * section asks for, walking the whole of Beat 7's mechanical spine —
 * Face Danger misses, Pay the Price is offered and its table rolled,
 * the "You are harmed" row chains to Endure Harm, and Endure Harm's own
 * preRoll and roll both resolve — through the real resolvers and the
 * real STARFORGED data, not a stand-in fixture.
 */
describe('chained moves: Face Danger → Pay the Price → Endure Harm (Beat 7)', () => {
  it('resolves the full chain end to end', () => {
    // Rook forces the bulkhead with +iron: actionDie 1, dice [9, 10] — a miss.
    const faceDangerRng = fixedRandomSource([0.05, 0.85, 0.95]);
    const faceDangerResult = resolveActionMove(
      faceDanger,
      faceDangerRng,
      [{ amount: 1, label: 'iron' }],
      2,
      0,
    );
    expect(faceDangerResult.roll.tier).toBe('miss');
    expect(faceDangerResult.chain).toEqual({
      mode: 'offer',
      reason: 'Face Danger, miss',
      to: 'move:fate/pay-the-price',
    });

    // The player accepts the offer and picks the highlighted table option.
    const methodResult = resolveMethodOption(payThePrice, 'table');
    expect(methodResult.effects).toEqual([
      {
        effect: { kind: 'oracle_roll', oracle: 'oracle:moves/pay-the-price' },
        clause: 'Roll on the table below.',
      },
    ]);
    const oracleChain = methodResult.chain;
    if (oracleChain === undefined || !('fromOracle' in oracleChain)) {
      throw new Error('expected an oracle chain');
    }

    // Rolling the table lands on "You are harmed" (75-81).
    const table = STARFORGED.oracles.find((t) => t.id === oracleChain.fromOracle);
    if (table === undefined) {
      throw new Error(`table ${oracleChain.fromOracle} not found in STARFORGED`);
    }
    const chainSteps = resolvePayThePriceChain(
      fixedRandomSource([forRoll(80)]),
      table,
      oracleChain.rows,
    );
    expect(chainSteps).toEqual([
      { roll: 80, rowText: 'You are harmed', to: 'move:suffer/endure-harm' },
    ]);

    const nextMove = chainSteps[0]?.to;
    expect(nextMove).toBe(endureHarm.moveId);

    // Endure Harm's preRoll (the harm-intake A13 exercises) is read
    // directly off the automation spec — it precedes and is independent
    // of whether a roll happens at all, so resolveActionMove doesn't
    // round-trip it.
    expect(endureHarm.preRoll?.effects).toEqual([
      {
        effect: {
          kind: 'proposed_amount',
          of: 'meter',
          meter: 'health',
          range: [-3, -1],
          proposedBy: 'ai',
          adjustableBy: 'player',
        },
        clause: 'suffer -1 health for minor harm, -2 for serious harm, or -3 for major harm.',
      },
    ]);

    // Then, if health is 0 or the player chooses to resist, Endure Harm
    // itself rolls +iron or +health, whichever is higher. actionDie 3 plus
    // a health/iron of 2 — actionScore 5 — against dice [6, 3]: a weak hit.
    const endureHarmRng = fixedRandomSource([0.4, 0.55, 0.25]);
    const endureHarmResult = resolveActionMove(
      endureHarm,
      endureHarmRng,
      [{ amount: 2, label: 'health' }],
      2,
      0,
    );
    expect(endureHarmResult.roll.tier).toBe('weak_hit');
    expect(endureHarmResult.choices).toEqual(endureHarm.outcomes.weak_hit?.choices);
  });
});
