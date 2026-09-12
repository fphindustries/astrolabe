/**
 * Event and DTO types shared by the server and the client.
 *
 * Task 2.2: the common envelope, the payload schema for every event type in
 * Milestone 1's spine, the per-type metadata readers need, and the payload
 * versioning scaffolding. The design these implement is
 * `docs/design-event-log.md`; the decisions behind it are D-83 to D-87.
 *
 * Three things to know before adding to this package:
 *
 * - **Schemas are the source of truth, types are inferred from them.** Zod
 *   validates on write always and on read too, so a hand-written interface
 *   alongside a schema would be a second place to drift. `DeepReadonly`
 *   restores the `readonly` the rest of the codebase uses.
 * - **`PAYLOAD_SCHEMAS` is the catalogue.** Adding a type there fails the
 *   compile at `EventSchema`'s completeness check, at `EVENT_TYPE_META`, and
 *   at every exhaustive switch in the projector — which is the point.
 * - **This package depends on `rules` for its vocabulary** (`MoveId`,
 *   `CharacterId`, `MeterId`) but only as types. `rules` stays the leaf and
 *   depends on nothing.
 */

export * from './ids.js';
export * from './readonly.js';
export * from './envelope.js';
export * from './delta.js';
export * from './cause.js';
export * from './events/index.js';
export * from './meta.js';
export * from './versioning.js';

/** Kept for the workspace smoke test (task 1.1); harmless now that real exports exist. */
export const SHARED_PACKAGE = '@astrolabe/shared' as const;
