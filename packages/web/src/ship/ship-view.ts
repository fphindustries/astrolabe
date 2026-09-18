import {
  installedModules,
  sharedStarshipBaseline,
  STARFORGED,
  withoutLinks,
  type AssetId,
  type LaunchReadiness,
} from '@astrolabe/rules';
import type { CampaignState, EventId } from '@astrolabe/shared';

import { PROVENANCE_TEXT } from '../launch/truths.js';

/**
 * The crew's ship as a reader sees it (7.2): what the Starship step shows
 * beside its form, and what play shows once, at crew level (D-192).
 *
 * Nothing here is automation. Abilities are shown as Reference: which are on
 * from the start, and what each says. Offering them to a move is out of scope
 * for Milestone 2 (D-192).
 */

export interface AbilityView {
  readonly text: string;
  /** On from the start (Datasworn's `enabled`); M2 tracks no later upgrades. */
  readonly enabled: boolean;
}

export interface ShipAssetView {
  readonly assetId: AssetId;
  readonly name: string;
  readonly abilities: readonly AbilityView[];
}

export interface InstalledModuleView extends ShipAssetView {
  readonly ownerCharacterId: string;
  /** D-190: every module keeps the character whose slot holds it. */
  readonly ownerName: string;
}

export interface ShipView {
  /** Null until a ship is accepted. */
  readonly name: string | null;
  readonly integrity: { readonly value: number; readonly max: number };
  readonly asset: ShipAssetView;
  /** Derived from the crew (D-191), so a revised or removed character changes it. */
  readonly modules: readonly InstalledModuleView[];
}

function assetView(assetId: AssetId): ShipAssetView {
  const asset = STARFORGED.assets.find((candidate) => candidate.id === assetId);
  return {
    assetId,
    name: asset?.name ?? assetId,
    abilities: (asset?.abilities ?? []).map((ability) => ({
      text: withoutLinks(ability.text),
      enabled: ability.enabledByDefault,
    })),
  };
}

export function shipView(state: CampaignState): ShipView {
  const ship = state.launch.starship;
  const baseline = sharedStarshipBaseline(STARFORGED);
  const characters = Object.values(state.characters);
  return {
    name: ship?.name ?? null,
    // The projected value once accepted, so later damage shows; the imported
    // starting meter before that (7.0b).
    integrity: {
      value: ship?.integrity.value ?? baseline.integrity.value,
      max: ship?.integrity.max ?? baseline.integrity.max,
    },
    asset: assetView(ship?.assetId ?? baseline.assetId),
    modules: installedModules(characters, STARFORGED).map((module) => ({
      ...assetView(module.assetId),
      ownerCharacterId: module.ownerCharacterId,
      ownerName:
        characters.find((character) => character.id === module.ownerCharacterId)?.name ?? 'Unknown',
    })),
  };
}

export interface ShipHistoryEntry {
  readonly eventId: EventId;
  readonly name: string;
  readonly summary: string;
  readonly provenance: string;
}

/** Superseded versions, oldest first (7.0f, A40), in the words the page shows. */
export function shipHistory(state: CampaignState): readonly ShipHistoryEntry[] {
  return state.launch.starshipHistory.map((entry) => ({
    eventId: entry.eventId,
    name: entry.name,
    summary: `${entry.history} Quirks: ${entry.quirks.join('; ')}`,
    provenance: PROVENANCE_TEXT[entry.provenance],
  }));
}

/**
 * The server's starship blockers keyed by the field they name, so each can sit
 * beside its field (D-176: the client restates no readiness rule).
 * `starship.quirks` → `quirks`; a blocker naming no field is keyed `ship`.
 */
export function blockersByField(
  readiness: LaunchReadiness,
): Readonly<Record<string, readonly string[]>> {
  const out: Record<string, string[]> = {};
  for (const blocker of readiness.sections.starship.blockers) {
    const field = blocker.path.startsWith('starship.') ? blocker.path.slice(9) : 'ship';
    (out[field] ??= []).push(blocker.message);
  }
  return out;
}
