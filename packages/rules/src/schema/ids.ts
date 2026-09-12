/**
 * Stable rule-content identifiers, minted by Astrolabe rather than borrowed
 * from Datasworn (design record D-21). A Datasworn version bump then
 * changes only the adapter's mapping onto these IDs, not the IDs
 * themselves or anything keyed to them (D-63).
 *
 * Two things verified against the actual Starforged data before choosing
 * this shape: move slugs collide across categories (`face_danger` exists
 * under both `adventure` and `scene_challenge`), and oracle leaf names
 * collide heavily (`feature` alone ×29). So a move ID keeps its category
 * segment, and an oracle ID keeps its full collection path.
 */
export type MoveId = `move:${string}`;
export type OracleId = `oracle:${string}`;
export type AssetId = `asset:${string}`;
export type RecipeId = `recipe:${string}`;
export type ImpactId = `impact:${string}`;

export type StatId = 'edge' | 'heart' | 'iron' | 'shadow' | 'wits';
export type MeterId = 'health' | 'spirit' | 'supply';

/** The 12 move categories present in the Starforged data. */
export type MoveCategoryId =
  | 'session'
  | 'adventure'
  | 'quest'
  | 'connection'
  | 'exploration'
  | 'combat'
  | 'suffer'
  | 'recover'
  | 'threshold'
  | 'legacy'
  | 'fate'
  | 'scene_challenge';

/**
 * Campaign-scoped instances — a particular vow, clock, or progress track —
 * are not rule content and get runtime identifiers issued by the event log
 * (task 2.x), not rule IDs. Branded so they cannot be mixed up with a plain
 * string or with each other.
 */
export type TrackId = string & { readonly __brand: 'TrackId' };
export type CharacterId = string & { readonly __brand: 'CharacterId' };

/**
 * Where an imported entry came from. Feeds the attribution screen (task
 * 1.10) and lets the traceability check (see traceability.ts) point back
 * at a specific rule entry.
 */
export interface Provenance {
  /** The original Datasworn ID, e.g. "starforged/moves/adventure/face_danger". */
  readonly sourceId: string;
  /** The Datasworn version this was imported from, e.g. "0.0.10" (D-63). */
  readonly sourceVersion: string;
  readonly book: string;
  readonly page?: number;
  readonly authors: readonly string[];
  /** e.g. "https://creativecommons.org/licenses/by/4.0" */
  readonly license: string;
  /** Where to find the source document — the attribution screen links here. */
  readonly url: string;
}
