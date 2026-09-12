import type { OutcomeTier } from './moves.js';

/**
 * A source of randomness dice can be built on. Implementations (task 1.4)
 * are seedable so the golden session (task 10.4) is deterministic under a
 * stubbed AI provider. The rules package never calls Math.random or a node
 * crypto API directly — eslint.config.js enforces this for this package —
 * so every roll takes one of these in.
 */
export interface RandomSource {
  /** A float in [0, 1), matching Math.random's contract. */
  next(): number;
}

export interface RollAdjustment {
  readonly amount: number;
  /** e.g. "wits", "Ace: guiding your vehicle", "bonus from Secure an Advantage" */
  readonly label: string;
}

/**
 * The result of an action roll. Momentum burn (task 1.6, A8, Beat 5) is
 * deliberately absent from MoveAutomation: it is not an outcome effect, it
 * is a roll-time substitution evaluated before the tier is known — replace
 * the action score with current momentum, recompute the tier, then reset
 * momentum. So it lives on the roll result instead.
 */
export interface ActionRollResult {
  readonly actionDie: number;
  readonly adds: readonly RollAdjustment[];
  /** Capped at 10. */
  readonly actionScore: number;
  readonly challengeDice: readonly [number, number];
  readonly tier: OutcomeTier;
  readonly isMatch: boolean;
  readonly burnOffer?: BurnOffer;
}

/**
 * Populated whenever momentum is positive and beats at least one challenge
 * die that the action score did not — what the app notices for Vesna in
 * Beat 5.
 */
export interface BurnOffer {
  readonly wouldBecome: OutcomeTier;
  readonly momentum: number;
  /** 2 minus marked impacts (D-74). */
  readonly resetsTo: number;
}

export interface ProgressRollResult {
  readonly progressScore: number;
  readonly challengeDice: readonly [number, number];
  readonly tier: OutcomeTier;
  readonly isMatch: boolean;
}

export interface OracleRollResult {
  /** The raw roll against the table's die (e.g. 1-100 for a 1d100 table). */
  readonly roll: number;
  readonly row: { readonly text: string; readonly text2?: string };
}
