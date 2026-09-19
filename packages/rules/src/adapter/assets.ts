import type { Datasworn } from '@datasworn/core';

import type {
  Asset,
  AssetAbility,
  AssetAttachments,
  AssetCategory,
  AssetCategoryId,
  AssetConditionMeter,
} from '../schema/assets.js';
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

interface RawAssetAttachments {
  readonly max?: number | null;
  readonly assets?: readonly string[];
}

interface RawAsset {
  readonly _id: string;
  readonly name: string;
  readonly category: string;
  readonly count_as_impact: boolean;
  readonly shared?: boolean;
  readonly requirement?: string;
  readonly attachments?: RawAssetAttachments;
  readonly controls?: Record<string, RawAssetControl>;
  readonly abilities: readonly RawAssetAbility[];
  readonly _source: Datasworn.SourceInfo;
}

interface RawAssetControl {
  readonly label: string;
  readonly field_type: string;
  readonly min?: number;
  readonly max?: number;
  readonly value?: unknown;
  readonly is_impact?: boolean;
  readonly controls?: Record<string, RawAssetControl>;
}

interface RawAssetCollection {
  readonly _id: string;
  readonly name: string;
  readonly description?: string;
  readonly contents?: Record<string, RawAsset>;
  readonly _source: Datasworn.SourceInfo;
}

/**
 * The six categories the Starforged data actually ships. Checked rather
 * than cast: a new collection in a future Datasworn version should fail the
 * import loudly, because D-89's creation rules are keyed to these.
 */
const ASSET_CATEGORY_IDS = new Set<string>([
  'path',
  'companion',
  'deed',
  'module',
  'support_vehicle',
  'command_vehicle',
]);

function requireCategoryId(key: string): AssetCategoryId {
  if (!ASSET_CATEGORY_IDS.has(key)) {
    throw new Error(`Unknown asset category "${key}"`);
  }
  return key as AssetCategoryId;
}

/**
 * Attachment patterns name a collection by wildcard path — the Starship's
 * selects every asset under `assets/module`. Only the category matters to
 * us, so the pattern is reduced to the category ids it selects.
 */
function mapAttachments(raw: RawAssetAttachments | undefined): AssetAttachments | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const categories: AssetCategoryId[] = [];
  for (const pattern of raw.assets ?? []) {
    for (const key of ASSET_CATEGORY_IDS) {
      if (pattern.includes(`/assets/${key}/`)) {
        categories.push(key as AssetCategoryId);
      }
    }
  }
  return {
    ...(raw.max !== null && raw.max !== undefined ? { max: raw.max } : {}),
    categories: [...new Set(categories)],
  };
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

/** Only condition meters are imported; card flips and the like carry no starting value. */
function mapConditionMeters(
  controls: Record<string, RawAssetControl> | undefined,
): AssetConditionMeter[] {
  return Object.entries(controls ?? {}).flatMap(([key, control]) => {
    if (control.field_type !== 'condition_meter') return [];
    if (
      typeof control.min !== 'number' ||
      typeof control.max !== 'number' ||
      typeof control.value !== 'number'
    )
      throw new Error(`Condition meter "${key}" is missing its min, max or value.`);
    return [
      {
        key,
        label: control.label,
        min: control.min,
        max: control.max,
        value: control.value,
        impacts: Object.entries(control.controls ?? {}).flatMap(([impactKey, impact]) =>
          impact.is_impact === true ? [{ key: impactKey, label: impact.label }] : [],
        ),
      },
    ];
  });
}

function mapAsset(
  raw: RawAsset,
  categoryId: AssetCategoryId,
  version: string,
  allMoveSourceIds: readonly string[],
): Asset {
  const attachments = mapAttachments(raw.attachments);
  const conditionMeters = mapConditionMeters(raw.controls);
  return {
    id: requireAssetId(raw._id),
    categoryId,
    category: raw.category,
    name: raw.name,
    countAsImpact: raw.count_as_impact,
    ...(raw.requirement !== undefined ? { requirement: rewriteLinks(raw.requirement) } : {}),
    shared: raw.shared ?? false,
    ...(attachments !== undefined ? { attachments } : {}),
    ...(conditionMeters.length > 0 ? { conditionMeters } : {}),
    abilities: raw.abilities.map((ability) => mapAssetAbility(ability, allMoveSourceIds)),
    source: mapProvenance(raw._id, version, raw._source),
  };
}

/**
 * The collection itself, imported as an entity. Its description carries
 * rules that exist nowhere else in the data — see AssetCategory.
 */
export function mapAssetCategory(
  key: string,
  raw: RawAssetCollection,
  version: string,
): AssetCategory {
  return {
    id: requireCategoryId(key),
    name: raw.name,
    description: rewriteLinks(raw.description ?? ''),
    source: mapProvenance(raw._id, version, raw._source),
  };
}

export function mapAssetCollection(
  key: string,
  raw: RawAssetCollection,
  version: string,
  allMoveSourceIds: readonly string[],
): readonly Asset[] {
  const categoryId = requireCategoryId(key);
  return Object.values(raw.contents ?? {}).map((asset) =>
    mapAsset(asset, categoryId, version, allMoveSourceIds),
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
  return Object.entries(raw).flatMap(([key, collection]) =>
    mapAssetCollection(key, collection, version, allMoveSourceIds),
  );
}

export function mapAssetCategories(
  raw: Record<string, RawAssetCollection>,
  version: string,
): readonly AssetCategory[] {
  return Object.entries(raw).map(([key, collection]) => mapAssetCategory(key, collection, version));
}
