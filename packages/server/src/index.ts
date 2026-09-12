/**
 * Astrolabe's server: authoritative over all dice and all state changes
 * (design record section 9).
 *
 * Contents arrive in order:
 *   2.1  Postgres schema and migrations (db/) — done
 *   2.x  the event writer, projections
 *   7.x  AI provider interface and the Claude implementation (D-60)
 *   8.x  the oracle roll API, including generation recipes (D-65)
 */

export * from './db/index.js';
export * from './projection/index.js';

export { RULES_PACKAGE } from '@astrolabe/rules';
export { SHARED_PACKAGE } from '@astrolabe/shared';

/** Placeholder until task 2.1 stands the API up. */
export const SERVER_PACKAGE = '@astrolabe/server' as const;
