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
 * Task 1.3 is the adapter (src/adapter/) and its frozen output
 * (src/generated/), exported below as STARFORGED: the whole Starforged
 * moves/oracles/assets/game-rules set, already mapped into the schema.
 *
 * Task 1.4 is dice (src/dice/): a seedable RandomSource, the action,
 * progress and oracle rolls built on it, and nothing about outcomes —
 * dice produce a RawActionRoll/RawProgressRoll, not a tier.
 *
 * Task 1.5 is outcome resolution (src/outcomes/): resolveTier compares a
 * score against the challenge dice — strictly greater, a tie doesn't
 * count as beating a die — and isMatch flags the two challenge dice
 * showing the same value. Both are shared between action and progress
 * rolls, and both are reused as-is by task 1.6's momentum burn, which
 * runs the same comparison speculatively against momentum instead of the
 * rolled score.
 *
 * Task 1.6 is momentum (src/momentum/): gain and loss are one signed-delta
 * function, not two, since the automation layer's momentum effect already
 * carries the sign; reset and max both come from D-74's formula (10/2
 * minus marked impacts); and computeBurnOffer/withBurnOffer complete what
 * task 1.5 left unset, by running resolveTier a second time against
 * momentum standing in for the action score.
 *
 * Task 1.7 is move automation (src/automation/): the hand-authored
 * MoveAutomation specs for exactly the moves D-59 scopes Milestone 1 to
 * (specs/), and the resolvers that apply one to a rolled or chosen
 * outcome (resolveActionMove, resolveMethodOption,
 * resolvePayThePriceChain, resolveEffectTarget for D-62's Aid Your Ally
 * redirect).
 *
 * Still to come:
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

export * from './dice/index.js';
export * from './outcomes/index.js';
export * from './momentum/index.js';
export * from './automation/index.js';

export type { AdaptedRuleset } from './adapter/index.js';
export { STARFORGED } from './generated/index.js';

/** Kept for the workspace smoke test (task 1.1); harmless now that real exports exist. */
export const RULES_PACKAGE = '@astrolabe/rules' as const;
