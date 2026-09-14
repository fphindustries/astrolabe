import {
  MOMENTUM_MIN,
  type AdaptedRuleset,
  type AssetId,
  type CharacterId,
  type ImpactId,
  type MeterId,
  type StatId,
  type TrackId,
} from '@astrolabe/rules';
import type { CharacterState, TrackState } from '@astrolabe/shared';

/**
 * Pure view-models over projected state, for the crew mini-cards (5.2's
 * `CrewCard`) and the character drawer. Kept out of JSX per the app's
 * component convention, and unit tested without any DOM.
 */

const STAT_ORDER: readonly StatId[] = ['edge', 'heart', 'iron', 'shadow', 'wits'];
const METER_ORDER: readonly MeterId[] = ['health', 'spirit', 'supply'];

export interface MeterView {
  readonly value: number;
  readonly max: number;
}

/** D-42: callsign, health, momentum only. Everything else opens in the drawer. */
export interface CrewCardView {
  readonly characterId: CharacterId;
  readonly callsign: string;
  readonly health: MeterView;
  readonly momentum: MeterView;
}

export function toCrewCard(character: CharacterState): CrewCardView {
  return {
    characterId: character.id,
    callsign: character.callsign,
    health: { value: character.meters.health.value, max: character.meters.health.max },
    momentum: { value: character.momentum.value, max: character.momentum.max },
  };
}

export interface StatView {
  readonly id: StatId;
  readonly value: number;
}

export interface NamedMeterView extends MeterView {
  readonly id: MeterId;
  readonly min: number;
  /** A16: the value was last set by hand, so it reads differently from an automated change. */
  readonly overridden: boolean;
}

export interface ImpactView {
  readonly id: ImpactId;
  readonly label: string;
}

export interface AssetView {
  readonly id: AssetId;
  readonly name: string;
}

export interface VowView {
  readonly trackId: TrackId;
  readonly title: string;
  readonly ticks: number;
  readonly maxTicks: number;
}

export interface CharacterSheetView {
  readonly characterId: string;
  readonly name: string;
  readonly callsign: string;
  readonly stats: readonly StatView[];
  readonly meters: readonly NamedMeterView[];
  readonly momentum: MeterView & {
    readonly min: number;
    readonly resetValue: number;
    readonly overridden: boolean;
  };
  readonly markedImpacts: readonly ImpactView[];
  readonly assets: readonly AssetView[];
  readonly bonusNextMove?: { readonly amount: number; readonly excludes?: 'progress_moves' };
  readonly vows: readonly VowView[];
  /** D-124: backstory hooks from creation. */
  readonly hooks: readonly string[];
}

/**
 * The full character drawer's content. Resolves asset and impact names
 * against `STARFORGED` (they're rule content, not stored on the character
 * — the character only stores the ids) and vow titles against the
 * campaign's projected tracks — D-89, D-92 note the same split for
 * creation, and the drawer reads the same way.
 */
export function toCharacterSheet(
  character: CharacterState,
  rules: AdaptedRuleset,
  tracks: Readonly<Record<TrackId, TrackState>>,
): CharacterSheetView {
  const assetById = new Map(rules.assets.map((asset) => [asset.id, asset]));
  const impactById = new Map(rules.gameRules.impacts.map((impact) => [impact.id, impact]));

  const bonusNextMove = character.bonusNextMove;

  return {
    characterId: character.id,
    name: character.name,
    callsign: character.callsign,
    stats: STAT_ORDER.map((id) => ({ id, value: character.stats[id] })),
    meters: METER_ORDER.map((id) => ({
      id,
      value: character.meters[id].value,
      min: character.meters[id].min,
      max: character.meters[id].max,
      overridden: character.meters[id].lastChangedBy.manual === true,
    })),
    momentum: {
      value: character.momentum.value,
      min: MOMENTUM_MIN,
      max: character.momentum.max,
      resetValue: character.momentum.resetValue,
      overridden: character.momentum.lastChangedBy.manual === true,
    },
    markedImpacts: (Object.keys(character.impacts) as ImpactId[]).map((id) => ({
      id,
      label: impactById.get(id)?.label ?? id,
    })),
    assets: character.assets.map((id) => ({ id, name: assetById.get(id)?.name ?? id })),
    ...(bonusNextMove !== undefined
      ? {
          bonusNextMove: {
            amount: bonusNextMove.amount,
            ...(bonusNextMove.excludes !== undefined ? { excludes: bonusNextMove.excludes } : {}),
          },
        }
      : {}),
    vows: character.vowTrackIds.map((trackId) => {
      const track = tracks[trackId];
      return {
        trackId,
        title: track?.title ?? 'Unknown vow',
        ticks: track?.ticks ?? 0,
        maxTicks: track?.maxTicks ?? 0,
      };
    }),
    hooks: character.hooks,
  };
}
