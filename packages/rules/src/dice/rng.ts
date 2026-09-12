import type { RandomSource } from '../schema/dice.js';

/**
 * mulberry32 — a small, fast, well-known 32-bit PRNG. Chosen over a
 * dependency (pre-build library proposal, section 2): dice need entropy,
 * but `crypto` isn't seedable and the whole point is that the golden
 * session (task 10.4) rolls the same dice every run under a stubbed AI
 * provider. Not cryptographically secure, and doesn't need to be — this is
 * for game dice, not security.
 */
export function createSeededRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
