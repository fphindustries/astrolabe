import { describe, expect, it } from 'vitest';

import { createSeededRandomSource } from './rng.js';
import {
  parseDiceExpression,
  rollActionDie,
  rollChallengeDice,
  rollDie,
  rollDiceExpression,
} from './primitives.js';

describe('rollDie', () => {
  it('stays within [1, sides] across many rolls', () => {
    const rng = createSeededRandomSource(1);
    for (let i = 0; i < 500; i++) {
      const value = rollDie(rng, 6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });

  it('is deterministic under a seeded source', () => {
    const a = createSeededRandomSource(99);
    const b = createSeededRandomSource(99);
    expect(rollDie(a, 10)).toBe(rollDie(b, 10));
  });

  it('reaches every face over enough rolls', () => {
    const rng = createSeededRandomSource(3);
    const seen = new Set(Array.from({ length: 500 }, () => rollDie(rng, 6)));
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe('rollActionDie', () => {
  it('is a 1d6', () => {
    const rng = createSeededRandomSource(5);
    for (let i = 0; i < 200; i++) {
      const value = rollActionDie(rng);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});

describe('rollChallengeDice', () => {
  it('rolls two independent 1d10s', () => {
    const rng = createSeededRandomSource(11);
    for (let i = 0; i < 200; i++) {
      const [d1, d2] = rollChallengeDice(rng);
      expect(d1).toBeGreaterThanOrEqual(1);
      expect(d1).toBeLessThanOrEqual(10);
      expect(d2).toBeGreaterThanOrEqual(1);
      expect(d2).toBeLessThanOrEqual(10);
    }
  });
});

describe('parseDiceExpression', () => {
  it('parses every dice expression actually present in the Starforged oracle data', () => {
    expect(parseDiceExpression('1d100')).toEqual({ count: 1, sides: 100 });
    expect(parseDiceExpression('1d20')).toEqual({ count: 1, sides: 20 });
    expect(parseDiceExpression('1d10')).toEqual({ count: 1, sides: 10 });
  });

  it('parses a multi-die expression, even though none occur in this ruleset', () => {
    expect(parseDiceExpression('2d6')).toEqual({ count: 2, sides: 6 });
  });

  it('rejects a malformed expression', () => {
    expect(() => parseDiceExpression('d100')).toThrow();
    expect(() => parseDiceExpression('1d')).toThrow();
    expect(() => parseDiceExpression('garbage')).toThrow();
  });
});

describe('rollDiceExpression', () => {
  it('sums every die in a multi-die expression', () => {
    const rng = createSeededRandomSource(4);
    for (let i = 0; i < 200; i++) {
      const value = rollDiceExpression(rng, '2d6');
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(12);
    }
  });

  it('stays within a 1d100 table’s full range', () => {
    const rng = createSeededRandomSource(6);
    const seenLow = Array.from({ length: 2000 }, () => rollDiceExpression(rng, '1d100')).some(
      (v) => v <= 5,
    );
    const seenHigh = Array.from({ length: 2000 }, () => rollDiceExpression(rng, '1d100')).some(
      (v) => v >= 96,
    );
    expect(seenLow).toBe(true);
    expect(seenHigh).toBe(true);
  });
});
