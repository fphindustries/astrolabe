/**
 * Read-model shapes projected from the event log (D-95).
 *
 * These are declared in `shared` rather than `server` so `web` can bind to
 * them without depending on the server package. The folds that produce
 * them (`project`, `buildNarrativeLog`) stay in `server/src/projection/`,
 * behind that package's purity lint fence — only the shapes live here.
 */
export * from './campaign-state.js';
export * from './narrative-log.js';
