import type { AssetId, MoveId, OracleId } from '../schema/ids.js';

/**
 * Converts a Datasworn source ID into an Astrolabe ID (design record D-21,
 * schema section 3.1). Rather than fixing a segment count per kind — which
 * breaks the moment a link targets a collection instead of a leaf entry,
 * e.g. "starforged/collections/oracles/derelicts/access" versus
 * "starforged/oracles/core/action" — this finds the kind marker
 * ("moves" | "oracles" | "truths" | "assets") wherever it falls in the path
 * and keeps everything after it. A Datasworn version bump then only risks
 * changing where the marker sits, not this function.
 *
 * Verified against the real 0.0.10 data before choosing this shape: move
 * slugs collide across categories (face_danger exists under both adventure
 * and scene_challenge), so the category segment is kept; oracle leaf names
 * collide far more (feature alone appears 29 times), so the full remaining
 * path is kept, not just the last segment.
 */
function kebab(segment: string): string {
  return segment.replace(/_/g, '-');
}

function pathAfterMarker(
  sourceId: string,
  markers: readonly string[],
): readonly string[] | undefined {
  const parts = sourceId.split('/');
  const markerIndex = parts.findIndex((part) => markers.includes(part));
  if (markerIndex === -1) {
    return undefined;
  }
  return parts.slice(markerIndex + 1);
}

export function moveIdFromSource(sourceId: string): MoveId | undefined {
  const rest = pathAfterMarker(sourceId, ['moves']);
  if (!rest || rest.length === 0) {
    return undefined;
  }
  return `move:${rest.map(kebab).join('/')}`;
}

/**
 * Oracle collections and truth-embedded tables share this namespace with
 * leaf oracle tables. Astrolabe does not yet model collections as their own
 * addressable entity (only leaf tables), so a link that targets a
 * collection — about a fifth of the markdown links in the Starforged data,
 * spelled either as the collection's real ID
 * ("starforged/collections/oracles/derelicts/access") or with the
 * "collections" marker dropped ("starforged/oracles/starships/mission") —
 * produces an ID that resolves to nothing in the imported OracleTable set.
 * That is a known, deliberate limitation: rendering these links live is a
 * later task, and no Milestone 1 automation clause depends on one
 * resolving. index.test.ts asserts this exactly: every non-collection link
 * resolves, and it also catches the 3 links in the data that are neither —
 * a genuine upstream Datasworn defect (a Faction Name template row points
 * at oracle tables that don't exist under any spelling), tracked rather
 * than silently ignored.
 */
export function oracleIdFromSource(sourceId: string): OracleId | undefined {
  const rest = pathAfterMarker(sourceId, ['oracles', 'truths']);
  if (!rest || rest.length === 0) {
    return undefined;
  }
  return `oracle:${rest.map(kebab).join('/')}`;
}

export function assetIdFromSource(sourceId: string): AssetId | undefined {
  const rest = pathAfterMarker(sourceId, ['assets']);
  if (!rest || rest.length === 0) {
    return undefined;
  }
  return `asset:${rest.map(kebab).join('/')}`;
}

/**
 * Rewrites a Datasworn source ID found in a markdown link or table embed to
 * its Astrolabe equivalent, dispatching on whichever kind marker is present.
 * An ID matching none of the three kinds — none are known to occur in the
 * Starforged data — is left unchanged rather than guessed at.
 */
export function rewriteSourceId(sourceId: string): string {
  return (
    moveIdFromSource(sourceId) ??
    oracleIdFromSource(sourceId) ??
    assetIdFromSource(sourceId) ??
    sourceId
  );
}
