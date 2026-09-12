import type { Datasworn } from '@datasworn/core';

import type { Asset, AssetAbility } from '../schema/assets.js';
import type { MoveId } from '../schema/ids.js';

import { assetIdFromSource, moveIdFromSource } from './id-mapping.js';
import { mapProvenance } from './provenance.js';
import { matchesWildcardPattern } from './wildcard.js';
import { rewriteLinks } from './text.js';

/**
 * Every `MoveEnhancement` variant (action-roll, no-roll, progress-roll,
 * special-track) carries the same `enhances` field, and that's the only
 * field this adapter reads — full trigger-override support for asset
 * enhancements is task 6.3's concern, not 1.3's.
 */
interface RawEnhanceMoves {
  readonly enhances: readonly string[] | null;
}

interface RawAssetAbility {
  readonly _id: string;
  readonly text: string;
  readonly enabled: boolean;
  readonly enhance_moves?: readonly RawEnhanceMoves[];
}

interface RawAsset {
  readonly _id: string;
  readonly name: string;
  readonly category: string;
  readonly count_as_impact: boolean;
  readonly abilities: readonly RawAssetAbility[];
  readonly _source: Datasworn.SourceInfo;
}

interface RawAssetCollection {
  readonly contents?: Record<string, RawAsset>;
}

function requireAssetId(sourceId: string) {
  const id = assetIdFromSource(sourceId);
  if (id === undefined) {
    throw new Error(`Could not derive an asset ID from "${sourceId}"`);
  }
  return id;
}

/**
 * A `null` `enhances` list means "any move of this roll_type" (verified:
 * 51 of 270 asset ability enhancements in the Starforged data use it) —
 * not a concrete, enumerable set of moves. Rather than guess at which
 * moves that could mean, this returns none; task 6.3, which actually
 * surfaces asset abilities during play, will need a roll_type match
 * instead of an ID list for this case. Wildcard patterns (the other 38)
 * are matched against every move's own Datasworn source ID — the same
 * space they were authored in — then converted to Astrolabe IDs.
 */
function resolveEnhancedMoveIds(
  patterns: readonly string[] | null,
  allMoveSourceIds: readonly string[],
): readonly MoveId[] {
  if (patterns === null) {
    return [];
  }
  const matchedSourceIds = new Set<string>();
  for (const pattern of patterns) {
    for (const sourceId of allMoveSourceIds) {
      if (matchesWildcardPattern(pattern, sourceId)) {
        matchedSourceIds.add(sourceId);
      }
    }
  }
  const ids: MoveId[] = [];
  for (const sourceId of matchedSourceIds) {
    const id = moveIdFromSource(sourceId);
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return ids;
}

function mapAssetAbility(raw: RawAssetAbility, allMoveSourceIds: readonly string[]): AssetAbility {
  const enhances = (raw.enhance_moves ?? []).flatMap((em) =>
    resolveEnhancedMoveIds(em.enhances, allMoveSourceIds),
  );
  return {
    id: raw._id.split('/').at(-1) ?? raw._id,
    enabledByDefault: raw.enabled,
    text: rewriteLinks(raw.text),
    enhances: [...new Set(enhances)],
  };
}

function mapAsset(raw: RawAsset, version: string, allMoveSourceIds: readonly string[]): Asset {
  return {
    id: requireAssetId(raw._id),
    category: raw.category,
    name: raw.name,
    countAsImpact: raw.count_as_impact,
    abilities: raw.abilities.map((ability) => mapAssetAbility(ability, allMoveSourceIds)),
    source: mapProvenance(raw._id, version, raw._source),
  };
}

export function mapAssetCollection(
  raw: RawAssetCollection,
  version: string,
  allMoveSourceIds: readonly string[],
): readonly Asset[] {
  return Object.values(raw.contents ?? {}).map((asset) =>
    mapAsset(asset, version, allMoveSourceIds),
  );
}

/**
 * `allMoveSourceIds` should be every imported move's `source.sourceId` —
 * the caller (adaptStarforged) maps moves first so this list is real, not
 * a second, possibly-drifting read of the raw data.
 */
export function mapAssets(
  raw: Record<string, RawAssetCollection>,
  version: string,
  allMoveSourceIds: readonly string[],
): readonly Asset[] {
  return Object.values(raw).flatMap((collection) =>
    mapAssetCollection(collection, version, allMoveSourceIds),
  );
}
