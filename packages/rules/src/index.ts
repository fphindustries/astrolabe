/**
 * Astrolabe's rules engine.
 *
 * Pure functions, no I/O, no runtime dependencies (design record section 9).
 * Datasworn is imported through the adapter at build time, never at
 * runtime, so this package stays free of I/O and the imported data stays
 * diffable.
 *
 * Task 1.2 is the schema below: the imported layer (moves, oracles,
 * assets, game constants) and the automation layer (hand-authored,
 * Datasworn ships no structured effects at all), plus the dice result
 * shapes and the one pure helper — isVerbatimClause — that task 1.9's
 * traceability test is built on.
 *
 * Still to come:
 *   1.3  the Datasworn adapter, populating Move / OracleTable / Asset / GameRules
 *   1.4  dice, against an injected RandomSource
 *   1.5  outcome resolution
 *   1.6  momentum
 *   1.7  move automation for the moves the golden session exercises (D-59)
 *   1.8  move relevance (D-66)
 */

export * from './schema/ids.js';
export * from './schema/moves.js';
export * from './schema/oracles.js';
export * from './schema/assets.js';
export * from './schema/game-rules.js';
export * from './schema/automation.js';
export * from './schema/dice.js';
export * from './schema/traceability.js';

/** Kept for the workspace smoke test (task 1.1); harmless now that real exports exist. */
export const RULES_PACKAGE = '@astrolabe/rules' as const;
