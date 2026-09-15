import type { Datasworn } from '@datasworn/core';

import type { AssetId, MeterId, MoveCategoryId, StatId } from '../schema/ids.js';
import type {
  Move,
  MoveOutcomeText,
  MoveTrigger,
  OutcomeTier,
  RollOption,
  RollType,
  TriggerCondition,
  TriggerMethod,
} from '../schema/moves.js';

import { assetIdFromSource, moveIdFromSource } from './id-mapping.js';
import { mapProvenance } from './provenance.js';
import { embeddedOraclesFromText, rewriteLinks } from './text.js';

function requireMoveId(sourceId: string) {
  const id = moveIdFromSource(sourceId);
  if (id === undefined) {
    throw new Error(`Could not derive a move ID from "${sourceId}"`);
  }
  return id;
}

function mapRollType(rollType: Datasworn.Move['roll_type']): RollType {
  switch (rollType) {
    case 'action_roll':
      return 'action';
    case 'no_roll':
      return 'none';
    case 'progress_roll':
      return 'progress';
    case 'special_track':
      return 'special_track';
    default:
      throw new Error(`Unhandled move roll_type "${rollType as string}"`);
  }
}

/**
 * The `method` values that actually occur on a top-level move trigger
 * condition, verified across every move in the Starforged data:
 * player_choice (85), highest (3), progress_roll (5), lowest (1), all (1).
 * The other values `ActionRollMethod`/`SpecialTrackRollMethod` admit —
 * miss, weak_hit, strong_hit — appear only inside asset ability
 * enhancements (task 6.3's concern), never on a move's own trigger.
 */
function mapTriggerMethod(method: string | null): TriggerMethod | null {
  if (method === null) {
    return null;
  }
  if (
    method === 'player_choice' ||
    method === 'highest' ||
    method === 'lowest' ||
    method === 'all' ||
    method === 'progress_roll'
  ) {
    return method;
  }
  throw new Error(`Unexpected top-level trigger method "${method}"`);
}

type RawRollOption =
  | Datasworn.RollableValue
  | Datasworn.ProgressRollOption
  | Datasworn.TriggerSpecialTrackConditionOption;

/**
 * `TriggerSpecialTrackConditionOption.using` is typed as `SpecialTrackType`,
 * which Datasworn defines as a bare `DictKey` (i.e. `string`) rather than a
 * literal union — so it overlaps every case below and defeats the
 * discriminated-union narrowing a switch on `.using` would otherwise give.
 * The per-field casts here are the adapter boundary absorbing that: each
 * one is justified by the shape actually verified against the Starforged
 * data (see moves.ts in the schema for the full `using` inventory), not a
 * guess.
 *
 * Asset option/attached-asset variants that `RollableValue` also admits
 * never occur on a move's own trigger — only inside asset ability
 * enhancements (task 6.3's concern) — so they are deliberately unhandled.
 */
function mapRollOption(raw: RawRollOption): RollOption {
  const using = raw.using as string;
  switch (using) {
    case 'stat':
      return { using: 'stat', stat: (raw as Datasworn.StatValueRef).stat as StatId };
    case 'condition_meter':
      return {
        using: 'condition_meter',
        meter: (raw as Datasworn.ConditionMeterValueRef).condition_meter as MeterId,
      };
    case 'progress_track':
      return { using: 'progress_track' };
    case 'asset_control': {
      const assets = (raw as Datasworn.AssetControlValueRef).assets;
      return {
        using: 'asset_control',
        assets:
          assets === null
            ? null
            : assets.map((a: string) => assetIdFromSource(a) ?? (a as AssetId)),
        control: (raw as Datasworn.AssetControlValueRef).control,
      };
    }
    case 'custom':
      return {
        using: 'custom',
        label: (raw as Datasworn.CustomValue).label,
        value: (raw as Datasworn.CustomValue).value,
      };
    case 'bonds_legacy':
      return { using: 'legacy_track', track: 'bonds' };
    case 'quests_legacy':
      return { using: 'legacy_track', track: 'quests' };
    case 'discoveries_legacy':
      return { using: 'legacy_track', track: 'discoveries' };
    default:
      throw new Error(`Unhandled roll option "using": ${using}`);
  }
}

interface RawTriggerCondition {
  readonly text?: string;
  readonly method: string | null;
  readonly roll_options: readonly RawRollOption[] | null;
}

function mapTriggerCondition(raw: RawTriggerCondition): TriggerCondition {
  return {
    ...(raw.text !== undefined && { text: rewriteLinks(raw.text) }),
    method: mapTriggerMethod(raw.method),
    rollOptions: (raw.roll_options ?? []).map(mapRollOption),
  };
}

function mapTrigger(text: string, conditions: readonly RawTriggerCondition[] | null): MoveTrigger {
  return {
    text: rewriteLinks(text),
    conditions: (conditions ?? []).map(mapTriggerCondition),
  };
}

function mapOutcomeText(raw: Datasworn.MoveOutcome): MoveOutcomeText {
  return { text: rewriteLinks(raw.text) };
}

function mapOutcomes(raw: Datasworn.Move): Partial<Record<OutcomeTier, MoveOutcomeText>> | null {
  if (raw.roll_type === 'no_roll') {
    return null;
  }
  return {
    strong_hit: mapOutcomeText(raw.outcomes.strong_hit),
    weak_hit: mapOutcomeText(raw.outcomes.weak_hit),
    miss: mapOutcomeText(raw.outcomes.miss),
  };
}

function outcomeTexts(
  outcomes: Partial<Record<OutcomeTier, MoveOutcomeText>> | null,
): readonly string[] {
  if (outcomes === null) {
    return [];
  }
  return Object.values(outcomes).map((o) => o.text);
}

export function mapMove(raw: Datasworn.Move, version: string): Move {
  const id = requireMoveId(raw._id);
  const rewrittenText = rewriteLinks(raw.text);
  const outcomes = mapOutcomes(raw);

  const declaredOracles = (raw.oracles ?? []).flatMap((sourceId: string) =>
    embeddedOraclesFromText(`{{table:${sourceId}}}`),
  );
  const embeddedFromText = [rewrittenText, ...outcomeTexts(outcomes)].flatMap(
    embeddedOraclesFromText,
  );
  const embeddedOracles = [...new Set([...declaredOracles, ...embeddedFromText])];

  // The category segment of a move's own ID is authoritative here — it's
  // the same value the category dictionary key holds, so this doesn't
  // trust two sources of truth for the same fact.
  const category = id.slice('move:'.length).split('/')[0] as MoveCategoryId;

  return {
    id,
    category,
    name: raw.name,
    rollType: mapRollType(raw.roll_type),
    trigger: mapTrigger(raw.trigger.text, raw.trigger.conditions),
    outcomes,
    text: rewrittenText,
    embeddedOracles,
    source: mapProvenance(raw._id, version, raw._source),
  };
}

export function mapMoveCategory(raw: Datasworn.MoveCategory, version: string): readonly Move[] {
  return Object.values(raw.contents ?? {}).map((move) => mapMove(move, version));
}
