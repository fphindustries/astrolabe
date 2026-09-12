/**
 * Astrolabe's rules engine.
 *
 * Pure functions, no I/O, no runtime dependencies (design record section 9).
 * Datasworn is imported through the adapter at build time, never at runtime,
 * so that this package stays free of I/O and the imported data stays diffable.
 *
 * Contents arrive in order:
 *   1.2  the internal rules schema
 *   1.3  the Datasworn adapter
 *   1.4  dice, against an injected RNG
 *   1.5  outcome resolution
 *   1.6  momentum
 *   1.7  move automation for the moves the golden session exercises (D-59)
 *   1.8  move relevance (D-66)
 */

/** Placeholder until task 1.2 defines the schema. */
export const RULES_PACKAGE = '@astrolabe/rules' as const;
