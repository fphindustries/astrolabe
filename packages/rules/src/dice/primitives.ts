import type { RandomSource } from '../schema/dice.js';

/** A single die of the given size, 1-indexed. */
export function rollDie(rng: RandomSource, sides: number): number {
  return Math.floor(rng.next() * sides) + 1;
}

/** Starforged's action die: 1d6. */
export function rollActionDie(rng: RandomSource): number {
  return rollDie(rng, 6);
}

/** Starforged's challenge dice: two 1d10, always rolled together. */
export function rollChallengeDice(rng: RandomSource): readonly [number, number] {
  return [rollDie(rng, 10), rollDie(rng, 10)];
}

export interface DiceExpression {
  readonly count: number;
  readonly sides: number;
}

/**
 * Every `dice` value actually present on a Starforged oracle table is a
 * single die of some size — "1d100", "1d20", "1d10" (verified directly,
 * no table sums multiple dice) — but this parses the general `NdM` form
 * rather than hard-coding those three, since a die count of 1 isn't a
 * schema guarantee, only an observation about this ruleset's data.
 */
export function parseDiceExpression(expression: string): DiceExpression {
  const match = /^(\d+)d(\d+)$/.exec(expression);
  if (!match) {
    throw new Error(`Unrecognised dice expression "${expression}"`);
  }
  const [, count, sides] = match;
  return { count: Number(count), sides: Number(sides) };
}

/** Rolls a dice expression like an oracle table's `dice` field and sums the result. */
export function rollDiceExpression(rng: RandomSource, expression: string): number {
  const { count, sides } = parseDiceExpression(expression);
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += rollDie(rng, sides);
  }
  return total;
}
