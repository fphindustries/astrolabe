/**
 * AI context assembly (tasks 7.4, 7.6, 7.7): pure functions from projected
 * state and events to an `AiRequest`. No I/O, no clock, no provider SDK —
 * the same fence `projection/` sits behind.
 */
export * from './authority-check.js';
export * from './authority-rubric.js';
export * from './beat-scope.js';
export * from './creation.js';
export * from './describe-beat.js';
export * from './latitude.js';
export * from './length.js';
export * from './prompt.js';
export * from './render-state.js';
export * from './segments.js';
