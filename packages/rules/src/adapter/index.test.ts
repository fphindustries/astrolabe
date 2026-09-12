import type { Datasworn } from '@datasworn/core';
import { describe, expect, it } from 'vitest';

import raw from '@datasworn/starforged/json/starforged.json' with { type: 'json' };

import { rewriteSourceId } from './id-mapping.js';
import { adaptStarforged } from './index.js';

const ruleset = raw as unknown as Datasworn.Ruleset;
const adapted = adaptStarforged(ruleset);

/**
 * Every node's `_id`, collected once so the link-resolution test can tell a
 * collection-targeted link from a genuinely broken one. Datasworn spells a
 * collection link two ways in the actual text: with its real `_id`
 * ("starforged/collections/oracles/derelicts/access") or with the
 * "collections" marker dropped ("starforged/oracles/starships/mission",
 * which is really "starforged/collections/oracles/starships/mission") — so
 * both forms are indexed here.
 */
function collectAllIds(node: unknown, ids: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectAllIds(item, ids);
    return;
  }
  if (node && typeof node === 'object') {
    const id = (node as { _id?: unknown })._id;
    if (typeof id === 'string') {
      ids.add(id);
      const withoutCollections = id.replace('/collections/', '/');
      if (withoutCollections !== id) {
        ids.add(withoutCollections);
      }
    }
    for (const value of Object.values(node)) collectAllIds(value, ids);
  }
}

function findAllLinkTargets(node: unknown, found: Set<string>): void {
  if (typeof node === 'string') {
    for (const match of node.matchAll(/\(id:([^)]+)\)/g)) {
      const id = match[1];
      if (id !== undefined) found.add(id);
    }
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) findAllLinkTargets(value, found);
  }
}

describe('adaptStarforged, end to end against the real Starforged data', () => {
  it('imports every move, oracle and asset with no silent drops', () => {
    const rawMoveCount = Object.values(ruleset.moves).reduce(
      (sum, c) => sum + Object.keys(c.contents ?? {}).length,
      0,
    );
    const rawAssetCount = Object.values(ruleset.assets).reduce(
      (sum, c) => sum + Object.keys(c.contents ?? {}).length,
      0,
    );
    expect(adapted.moves).toHaveLength(rawMoveCount);
    expect(adapted.assets).toHaveLength(rawAssetCount);
    expect(adapted.oracles.length).toBeGreaterThan(200);
  });

  it('mints a unique ID for every move, oracle and asset (no collisions within a kind)', () => {
    expect(new Set(adapted.moves.map((m) => m.id)).size).toBe(adapted.moves.length);
    expect(new Set(adapted.oracles.map((o) => o.id)).size).toBe(adapted.oracles.length);
    expect(new Set(adapted.assets.map((a) => a.id)).size).toBe(adapted.assets.length);
  });

  it('resolves every leaf-targeted markdown link, and accounts for every link that does not', () => {
    const moveIds = new Set(adapted.moves.map((m) => m.id as string));
    const oracleIds = new Set(adapted.oracles.map((o) => o.id as string));
    const assetIds = new Set(adapted.assets.map((a) => a.id as string));

    const allDataswornIds = new Set<string>();
    collectAllIds(ruleset, allDataswornIds);

    const linkTargets = new Set<string>();
    findAllLinkTargets(ruleset, linkTargets);
    expect(linkTargets.size).toBeGreaterThan(0);

    const collectionLinks: string[] = [];
    const brokenLinks: string[] = [];
    let resolvedLeafLinks = 0;

    for (const sourceId of linkTargets) {
      const astrolabeId = rewriteSourceId(sourceId);
      if (moveIds.has(astrolabeId) || oracleIds.has(astrolabeId) || assetIds.has(astrolabeId)) {
        resolvedLeafLinks++;
        continue;
      }
      // Not a leaf we imported — either it targets a collection (Astrolabe
      // doesn't model those as addressable entities yet, see
      // id-mapping.ts), or the link is simply broken in the source data.
      if (
        allDataswornIds.has(sourceId) ||
        allDataswornIds.has(`starforged/collections/${sourceId.slice('starforged/'.length)}`)
      ) {
        collectionLinks.push(sourceId);
      } else {
        brokenLinks.push(sourceId);
      }
    }

    expect(resolvedLeafLinks).toBeGreaterThan(0);
    expect(collectionLinks.length).toBeGreaterThan(0);

    // Verified directly against 0.0.10: these three links in the Faction
    // Name template row point at oracle tables that do not exist anywhere
    // in the ruleset, under any spelling. That's an upstream Datasworn data
    // defect, not an Astrolabe adapter bug — asserting the exact set here
    // means a data version bump that fixes it, or introduces a new broken
    // link, shows up as a test change instead of passing silently either way.
    expect(brokenLinks.sort()).toEqual(
      [
        'starforged/oracles/factions/affiliation',
        'starforged/oracles/factions/identity',
        'starforged/oracles/factions/legacy',
      ].sort(),
    );
  });

  it('carries the Datasworn version onto every imported entry’s provenance', () => {
    for (const move of adapted.moves) {
      expect(move.source.sourceVersion).toBe('0.0.10');
    }
  });
});
