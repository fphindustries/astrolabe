/**
 * State projection: pure, and tested without a database.
 *
 * The split from `db/` is structural, not stylistic. Everything here is a
 * fold over events with no I/O of any kind, which is what lets the largest
 * test suite in the milestone run in milliseconds and what makes
 * "projection is a pure function of the log" a checkable property rather
 * than an intention. `eslint.config.js` enforces it.
 */

export * from './state.js';
export * from './void-state.js';
export { project, applyEvent, canApplyIncrementally } from './project.js';
export * from './narrative-log.js';
export * from './cascade.js';
