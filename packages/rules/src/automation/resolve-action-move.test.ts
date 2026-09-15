import { describe, expect, it } from 'vitest';

import { createSeededRandomSource } from '../dice/rng.js';
import type { MoveAutomation } from '../schema/automation.js';
import type { RandomSource } from '../schema/dice.js';
import { resolveActionMove } from './resolve-action-move.js';
import { endureHarm, faceDanger, gatherInformation, secureAnAdvantage } from './specs/index.js';

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

  it('carries marked impacts through to the burn offer’s impact-reduced reset value (D-74)', () => {
    // actionDie 4, dice [6, 3] -> weak hit; momentum 7 would beat both.
    const rng = fixedRandomSource([0.55, 0.55, 0.25]);
    const result = resolveActionMove(gatherInformation, rng, [], 7, 2);
    expect(result.roll.tier).toBe('weak_hit');
    expect(result.roll.burnOffer).toEqual({ wouldBecome: 'strong_hit', momentum: 7, resetsTo: 0 });
  });

  it('surfaces a match through the full resolver, independent of tier (a miss can still match)', () => {
    // actionDie 4, challenge dice 7 and 7 -> beats neither (miss), matched.
    const rng = fixedRandomSource([0.55, 0.65, 0.65]);
    const result = resolveActionMove(faceDanger, rng, [], 0, 0);
    expect(result.roll.tier).toBe('miss');
    expect(result.roll.challengeDice).toEqual([7, 7]);
    expect(result.roll.isMatch).toBe(true);
  });

  it('resolves Secure an Advantage’s weak-hit choice across every seed that reaches it', () => {
    let weakHitsSeen = 0;
    for (let seed = 0; seed < 500; seed++) {
      const rng = createSeededRandomSource(seed);
      const result = resolveActionMove(
        secureAnAdvantage,
        rng,
        [{ amount: 2, label: 'wits' }],
        0,
        0,
      );
      expect(result.effects).toEqual(secureAnAdvantage.outcomes[result.roll.tier]?.effects);
      expect(result.choices).toEqual(secureAnAdvantage.outcomes[result.roll.tier]?.choices ?? []);
      if (result.roll.tier === 'weak_hit') {
        weakHitsSeen++;
        expect(result.choices).toHaveLength(1);
        expect(result.choices[0]?.options.map((o) => o.id)).toEqual(['momentum', 'bonus']);
      }
    }
    expect(weakHitsSeen).toBeGreaterThan(0);
  });

  it('resolves Endure Harm’s choices across every tier it can reach, never throwing', () => {
    const seenTiers = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      const rng = createSeededRandomSource(seed);
      const result = resolveActionMove(endureHarm, rng, [{ amount: 2, label: 'health' }], 0, 0);
      seenTiers.add(result.roll.tier);
      expect(result.choices).toEqual(endureHarm.outcomes[result.roll.tier]?.choices);
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
