/**
 * Astrolabe's server: authoritative over all dice and all state changes
 * (design record section 9).
 *
 * Contents arrive in order:
 *   2.1  Postgres schema and migrations (db/) — done
 *   2.x  the event writer, projections — done
 *   5.0  the HTTP read API (http/) — done; write routes land with the
 *        first task that needs them (D-94)
 *   7.x  AI provider interface and the Claude implementation (D-60)
 *   8.x  the oracle roll API, including generation recipes (D-65)
 */

export * from './db/index.js';
export * from './projection/index.js';
export * from './http/app.js';
export * from './random-source.js';

export { RULES_PACKAGE } from '@astrolabe/rules';
export { SHARED_PACKAGE } from '@astrolabe/shared';

/** Kept for the workspace smoke test (task 1.1). */
export const SERVER_PACKAGE = '@astrolabe/server' as const;
