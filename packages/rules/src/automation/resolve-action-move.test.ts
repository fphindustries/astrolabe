import { describe, expect, it } from 'vitest';

import { createSeededRandomSource } from '../dice/rng.js';
import type { MoveAutomation } from '../schema/automation.js';
import type { RandomSource } from '../schema/dice.js';
import { resolveActionMove } from './resolve-action-move.js';
import { faceDanger, gatherInformation } from './specs/index.js';

/**
 * A RandomSource that returns a fixed queue of values, so a test can drive
 * an exact die result without seed-hunting. It is a real RandomSource, not
 * a mock of one — task 1.4 designed the interface exactly so any object
 * satisfying `next(): number` is usable by the production dice functions.
 */
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

describe('resolveActionMove', () => {
  it('reproduces Beat 5 exactly: Vesna’s Gather Information at action score 5 against [6, 3], momentum +7', () => {
    // actionDie 2 (0.2 -> floor(1.2)=1, +1=2), then challenge dice 6 and 3.
    const rng = fixedRandomSource([0.2, 0.55, 0.25]);
    const result = resolveActionMove(
      gatherInformation,
      rng,
      [{ amount: 3, label: 'wits, with Rook’s +1 from Secure an Advantage' }],
      7,
      0,
    );

    expect(result.roll.actionScore).toBe(5);
    expect(result.roll.challengeDice).toEqual([6, 3]);
    expect(result.roll.tier).toBe('weak_hit');
    expect(result.roll.burnOffer).toEqual({ wouldBecome: 'strong_hit', momentum: 7, resetsTo: 2 });
    expect(result.effects).toEqual(gatherInformation.outcomes.weak_hit?.effects);
    expect(result.chain).toBeUndefined();
  });

  it('reproduces Beat 3: a weak hit on Gather Information carries +1 momentum and no chain', () => {
    // actionDie 1, challenge dice 9 and 10 -> beats neither -> would be a
    // miss on its own, so instead force a score that beats exactly one die.
    // actionDie 6 (floor(0.99*6)=5,+1=6), dice 5 and 9: beats 5, not 9.
    const rng = fixedRandomSource([0.99, 0.45, 0.85]);
    const result = resolveActionMove(gatherInformation, rng, [], 0, 0);

    expect(result.roll.tier).toBe('weak_hit');
    expect(result.effects).toEqual([
      {
        effect: { kind: 'momentum', delta: 1, target: 'actor' },
        clause: 'Then, take +1 momentum.',
      },
    ]);
    expect(result.chain).toBeUndefined();
  });

  it('reproduces Beat 7’s chain: a miss on Face Danger offers Pay the Price', () => {
    // actionDie 1, challenge dice 9 and 10 -> beats neither -> miss.
    const rng = fixedRandomSource([0.05, 0.85, 0.95]);
    const result = resolveActionMove(faceDanger, rng, [], 0, 0);

    expect(result.roll.tier).toBe('miss');
    expect(result.effects).toEqual([]);
    expect(result.chain).toEqual({
      mode: 'offer',
      reason: 'Face Danger, miss',
      to: 'move:fate/pay-the-price',
    });
  });

  it('never offers a burn when the roll is already a strong hit, even with positive momentum', () => {
    // actionDie 6, challenge dice 1 and 1 -> already beats both.
    const rng = fixedRandomSource([0.99, 0.05, 0.05]);
    const result = resolveActionMove(faceDanger, rng, [], 5, 0);
    expect(result.roll.tier).toBe('strong_hit');
    expect(result.roll.burnOffer).toBeUndefined();
  });

  it('reaches every tier over enough seeded rolls, each matching its own spec’s effects exactly', () => {
    const seenTiers = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      const rng = createSeededRandomSource(seed);
      const result = resolveActionMove(faceDanger, rng, [{ amount: 2, label: 'edge' }], 0, 0);
      seenTiers.add(result.roll.tier);
      expect(result.effects).toEqual(faceDanger.outcomes[result.roll.tier]?.effects);
    }
    expect(seenTiers).toEqual(new Set(['strong_hit', 'weak_hit', 'miss']));
  });

  it('throws when the automation has no outcome spec for the resulting tier', () => {
    const incomplete: MoveAutomation = {
      moveId: 'move:adventure/face-danger',
      level: 'automated',
      outcomes: {}, // no tiers at all
    };
    const rng = createSeededRandomSource(1);
    expect(() => resolveActionMove(incomplete, rng, [], 0, 0)).toThrow();
  });
});
