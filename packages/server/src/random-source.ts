import { randomBytes } from 'node:crypto';

import type { RandomSource } from '@astrolabe/rules';

/**
 * The server's real source of entropy for dice (design record §9: all dice
 * go through the server). `rules`'s own `createSeededRandomSource` is for
 * tests and the golden-session harness only; every roll that matters for
 * real play — starting with task 4.2's truth rolls — takes this instead,
 * the same `RandomSource` interface either way (section 1's convention).
 *
 * Backed by `crypto.randomBytes` rather than `Math.random`, matching
 * `DiceRolledSchema.rng.source`'s `'crypto'` value.
 */
export function cryptoRandomSource(): RandomSource {
  return {
    next(): number {
      return randomBytes(4).readUInt32BE(0) / 0x100000000;
    },
  };
}
