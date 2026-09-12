import type { Datasworn } from '@datasworn/core';

import type { Asset } from '../schema/assets.js';
import type { GameRules } from '../schema/game-rules.js';
import type { Move } from '../schema/moves.js';
import type { OracleTable } from '../schema/oracles.js';

import { mapAssets } from './assets.js';
import { mapGameRules } from './game-rules.js';
import { mapMoveCategory } from './moves.js';
import { mapOracles } from './oracles.js';

export interface AdaptedRuleset {
  readonly gameRules: GameRules;
  readonly moves: readonly Move[];
  readonly oracles: readonly OracleTable[];
  readonly assets: readonly Asset[];
}

/**
 * The Datasworn adapter's single entry point (design record section 5,
 * schema section 3.6). Runs as a build step (see scripts/generate-datasworn.ts),
 * never at runtime — this function itself is pure, taking an already-parsed
 * ruleset and returning plain data, so it has no I/O of its own.
 *
 * Scoped to moves, assets and oracles per milestone-1.md task 1.3. Truths
 * are explicitly a later task's concern (4.2) and are not imported here.
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
  };
}

export * from './assets.js';
export * from './game-rules.js';
export * from './id-mapping.js';
export * from './moves.js';
export * from './oracles.js';
export * from './text.js';
export * from './wildcard.js';
