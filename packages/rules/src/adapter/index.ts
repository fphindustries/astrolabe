import type { Datasworn } from '@datasworn/core';

import type { Asset, AssetCategory } from '../schema/assets.js';
import type { GameRules } from '../schema/game-rules.js';
import type { Move } from '../schema/moves.js';
import type { OracleTable } from '../schema/oracles.js';
import type { SettingTruth } from '../schema/truths.js';

import { mapAssetCategories, mapAssets } from './assets.js';
import { mapGameRules } from './game-rules.js';
import { mapMoveCategory } from './moves.js';
import { mapOracles } from './oracles.js';
import { mapTruths } from './truths.js';

export interface AdaptedRuleset {
  readonly gameRules: GameRules;
  readonly moves: readonly Move[];
  readonly oracles: readonly OracleTable[];
  readonly assets: readonly Asset[];
  /** Imported as entities: their descriptions carry rules nothing else does (D-89). */
  readonly assetCategories: readonly AssetCategory[];
  /** Setting truths preserve their oracle shape plus launch-only metadata. */
  readonly truths: readonly SettingTruth[];
}

/**
 * The Datasworn adapter's single entry point (design record section 5,
 * schema section 3.6). Runs as a build step (see scripts/generate-datasworn.ts),
 * never at runtime — this function itself is pure, taking an already-parsed
 * ruleset and returning plain data, so it has no I/O of its own.
 */
export function adaptStarforged(raw: Datasworn.Ruleset): AdaptedRuleset {
  const version = raw.datasworn_version;

  const moves = Object.values(raw.moves).flatMap((category) => mapMoveCategory(category, version));
  // Assets' wildcard move-enhancement patterns are resolved against every
  // imported move's own source ID, not re-derived from the raw data a
  // second time.
  const allMoveSourceIds = moves.map((move) => move.source.sourceId);

  return {
    gameRules: mapGameRules(raw.rules),
    moves,
    oracles: mapOracles(raw.oracles, version),
    assets: mapAssets(raw.assets, version, allMoveSourceIds),
    assetCategories: mapAssetCategories(raw.assets, version),
    truths: mapTruths(raw.truths ?? {}, version),
  };
}

export * from './assets.js';
export * from './game-rules.js';
export * from './id-mapping.js';
export * from './moves.js';
export * from './oracles.js';
export * from './text.js';
export * from './truths.js';
export * from './wildcard.js';
