import { STARFORGED } from '@astrolabe/rules';
import {
  EVENT_TYPE_META,
  withdrawalReason,
  type NarrativeBeat,
  type NarrativeEntry,
  type NarrativeLog,
  type OracleChip,
} from '@astrolabe/shared';

/**
 * Pure view-model for the narrative log (task 5.4). The server already
 * filters to narrative event types (`EVENT_TYPE_META[type].narrative`,
 * `server/src/projection/narrative-log.ts`), so this module's job is only
 * rendering, not re-filtering. `toBody`'s `switch` covers every type that
 * flag currently marks narrative; a type added later that this switch
 * doesn't yet know falls to the `unknown` case rather than vanishing or
 * throwing.
 */

export interface VoidMarkView {
  readonly kind: 'player_void' | 'reroll';
  readonly reason: string;
}

export type EntryBody =
  | { readonly kind: 'scene'; readonly title: string }
  | {
      readonly kind: 'move';
      readonly moveId: string;
      readonly aiding: boolean;
      readonly actionText?: string;
    }
  | {
      readonly kind: 'roll';
      readonly tier: 'strong_hit' | 'weak_hit' | 'miss';
      readonly isMatch: boolean;
      readonly burnOffered: boolean;
      readonly burnTaken: boolean;
    }
  | { readonly kind: 'burn'; readonly tierBefore: string; readonly tierAfter: string }
  | {
      readonly kind: 'move_choice_made';
      readonly choiceId: string;
      readonly optionIds: readonly string[];
    }
  | { readonly kind: 'move_method_chosen'; readonly optionId: string }
  | {
      readonly kind: 'move_chained';
      readonly toMoveId: string;
      readonly mode: 'auto' | 'offer';
      readonly reason: string;
    }
  | { readonly kind: 'oracle_rolled'; readonly roll: number; readonly rowText: string }
  | {
      /** D-136. */
      readonly kind: 'trigger_note';
      readonly triggerText: string;
      readonly reason: string;
      readonly confidence: 'low' | 'medium' | 'high';
    }
  | {
      readonly kind: 'amount_proposed';
      readonly amount: number;
      readonly meter: 'health' | 'spirit' | 'supply';
      /** D-130. */
      readonly injury?: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'amount_committed';
      readonly amount: number;
      readonly meter: 'health' | 'spirit' | 'supply';
    }
  | {
      /** D-143: the Guide's options, as offered. */
      readonly kind: 'complication_offered';
      readonly options: readonly { readonly text: string; readonly chips: readonly ChipView[] }[];
    }
  | {
      /** D-15, D-143: the complication the player set, and where its words came from. */
      readonly kind: 'complication_set';
      readonly text: string;
      readonly source: 'written' | 'offered';
      readonly fromOffer: boolean;
    }
  | { readonly kind: 'track_created'; readonly title: string }
  | { readonly kind: 'track_advanced'; readonly ticks: number; readonly reason?: string }
  | { readonly kind: 'entity_established'; readonly name: string }
  | {
      readonly kind: 'narration';
      readonly text: string;
      /** D-17, 8.2: the rolls the passage was grounded in, as chips under it. */
      readonly chips: readonly ChipView[];
      readonly corrected: boolean;
      readonly original?: string;
      readonly note?: string;
    }
  | {
      /** D-128: generated text that failed a check, struck, with its reason in words. */
      readonly kind: 'withdrawal';
      readonly role: 'beat' | 'revision' | 'injury' | 'summary';
      readonly reason: string;
      readonly rejectedText: string;
      /** What the checker quoted, for the reader to see exactly what was wrong. */
      readonly quotes: readonly string[];
    }
  | {
      readonly kind: 'override';
      readonly from: number;
      readonly to: number;
      readonly reason?: string;
    }
  | {
      readonly kind: 'void';
      readonly cascadedCount: number;
      readonly reason: string;
      /** D-70: the roll a reroll discarded, when that is what this void is. */
      readonly rerolled?: string;
    }
  | { readonly kind: 'session_ended'; readonly summary: string }
  | { readonly kind: 'unknown'; readonly type: string };

/** One oracle chip: what was rolled, labelled by the recipe slot it filled or its table. */
export interface ChipView {
  readonly eventId: string;
  readonly label: string;
  readonly roll: number;
  readonly rowText: string;
  /** Struck through (D-18): discarded by a reroll or voided with its beat. */
  readonly struck: boolean;
  /** D-70: the Guide's reason for rerolling it. */
  readonly discardedBecause?: string;
}

/** A chip as shown: labelled by its question, its recipe slot, or its table (8.2, 8.4). */
export function toChipView(chip: OracleChip): ChipView {
  return {
    eventId: chip.eventId,
    label:
      chip.question !== undefined
        ? chip.question
        : chip.slot !== undefined
          ? chip.slot.replace(/_/g, ' ')
          : (STARFORGED.oracles.find((t) => t.id === chip.oracleId)?.name ?? chip.oracleId),
    roll: chip.roll,
    rowText: chip.rowText,
    struck: chip.voided,
    ...(chip.discardedBecause !== undefined ? { discardedBecause: chip.discardedBecause } : {}),
  };
}

export interface EntryView {
  readonly eventId: string;
  readonly body: EntryBody;
  readonly voided: boolean;
  readonly voidMarks: readonly VoidMarkView[];
  /** Task 6.10: whether this event is a legal void target at all (`EVENT_TYPE_META.voidable`). */
  readonly voidable: boolean;
}

export interface BeatView {
  readonly commandId: string;
  readonly seq: number;
  readonly voided: boolean;
  readonly entries: readonly EntryView[];
}

export function toBeatView(beat: NarrativeBeat): BeatView {
  return {
    commandId: beat.commandId,
    seq: beat.seq,
    voided: beat.voided,
    entries: beat.entries.map(toEntryView),
  };
}

export function toEntryView(entry: NarrativeEntry): EntryView {
  return {
    eventId: entry.event.id,
    body: toBody(entry),
    voided: entry.voided,
    voidMarks: entry.voidedBy.map((mark) => ({ kind: mark.kind, reason: mark.reason })),
    // Guarded rather than a direct index: this view-model must survive a
    // type the running build doesn't know yet, the same tolerance toBody's
    // own `unknown` fallback gives it.
    voidable:
      (EVENT_TYPE_META as Record<string, { readonly voidable: boolean }>)[entry.event.type]
        ?.voidable ?? false,
  };
}

function toBody(entry: NarrativeEntry): EntryBody {
  const event = entry.event;
  switch (event.type) {
    case 'scene.started':
      return { kind: 'scene', title: event.payload.title };
    case 'move.invoked':
      return {
        kind: 'move',
        moveId: event.payload.moveId,
        aiding: event.payload.aidingAllyId !== undefined,
        ...(event.payload.actionText !== undefined ? { actionText: event.payload.actionText } : {}),
      };
    case 'dice.rolled':
      return {
        kind: 'roll',
        tier: event.payload.tier,
        isMatch: event.payload.isMatch,
        burnOffered: event.payload.kind === 'action' && event.payload.burnOffer !== undefined,
        burnTaken: entry.burnTaken === true,
      };
    case 'momentum.burned':
      return {
        kind: 'burn',
        tierBefore: event.payload.tierBefore,
        tierAfter: event.payload.tierAfter,
      };
    case 'move.choice_made':
      return {
        kind: 'move_choice_made',
        choiceId: event.payload.choiceId,
        optionIds: event.payload.optionIds,
      };
    case 'move.method_chosen':
      return { kind: 'move_method_chosen', optionId: event.payload.optionId };
    case 'move.chained':
      return {
        kind: 'move_chained',
        toMoveId: event.payload.toMoveId,
        mode: event.payload.mode,
        reason: event.payload.reason,
      };
    case 'oracle.rolled':
      return { kind: 'oracle_rolled', roll: event.payload.roll, rowText: event.payload.rowText };
    case 'move.trigger_noted':
      return {
        kind: 'trigger_note',
        triggerText: event.payload.triggerText,
        reason: event.payload.reason,
        confidence: event.payload.confidence,
      };
    case 'amount.proposed':
      return {
        kind: 'amount_proposed',
        amount: event.payload.amount,
        meter: event.payload.meter,
        ...(event.payload.injury !== undefined ? { injury: event.payload.injury } : {}),
        reason: event.payload.reason,
      };
    case 'amount.committed':
      return {
        kind: 'amount_committed',
        amount: event.payload.amount,
        meter: event.payload.meter,
      };
    case 'complication.offered':
      return {
        kind: 'complication_offered',
        options: event.payload.options.map((option) => ({
          text: option.text,
          chips: (entry.chips ?? [])
            .filter((chip) => option.groundedIn.includes(chip.eventId))
            .map(toChipView),
        })),
      };
    case 'complication.set':
      return {
        kind: 'complication_set',
        text: event.payload.text,
        source: event.payload.source,
        fromOffer: event.payload.offeredEventId !== undefined,
      };
    case 'track.created':
      return { kind: 'track_created', title: event.payload.title };
    case 'track.advanced':
      return {
        kind: 'track_advanced',
        ticks: event.payload.ticks,
        ...(event.payload.cause.kind === 'ai_judgement'
          ? { reason: event.payload.cause.reason }
          : {}),
      };
    case 'entity.established':
      return { kind: 'entity_established', name: event.payload.name };
    case 'narration.written': {
      const narration = entry.narration;
      return {
        kind: 'narration',
        text: narration?.text ?? event.payload.text,
        chips: (entry.chips ?? []).map(toChipView),
        corrected: narration?.corrected === true,
        ...(narration?.original !== undefined ? { original: narration.original } : {}),
        ...(narration?.note !== undefined ? { note: narration.note } : {}),
      };
    }
    case 'narration.withdrawn':
      return {
        kind: 'withdrawal',
        role: event.payload.role,
        reason: withdrawalReason(event.payload.violations),
        rejectedText: event.payload.rejectedText,
        quotes: event.payload.violations.map((v) => v.quote).filter((q) => q.length > 0),
      };
    case 'state.overridden':
      return {
        kind: 'override',
        from: event.payload.from,
        to: event.payload.to,
        ...(event.payload.reason !== undefined ? { reason: event.payload.reason } : {}),
      };
    case 'event.voided':
      return {
        kind: 'void',
        cascadedCount: event.payload.cascaded.length,
        reason: event.payload.reason,
        ...(event.payload.kind === 'reroll' ? { rerolled: event.payload.targetEventId } : {}),
      };
    case 'session.ended':
      return { kind: 'session_ended', summary: event.payload.summary };
    default:
      return { kind: 'unknown', type: event.type };
  }
}

/**
 * A roll that a passage shows as a chip isn't shown again as a row of its
 * own (8.2), and neither is the reroll that discarded it, whose reason the
 * chip carries (D-70). A roll no loaded passage cites keeps its row: dice
 * that were rolled stay visible.
 */
export function withoutChippedRolls(beats: readonly BeatView[]): readonly BeatView[] {
  const chipped = new Set(
    beats.flatMap((beat) =>
      beat.entries.flatMap((entry) =>
        entry.body.kind === 'narration'
          ? entry.body.chips.map((chip) => chip.eventId)
          : entry.body.kind === 'complication_offered'
            ? entry.body.options.flatMap((option) => option.chips.map((chip) => chip.eventId))
            : [],
      ),
    ),
  );
  return beats
    .map((beat) => ({
      ...beat,
      entries: beat.entries.filter(
        (entry) =>
          !(entry.body.kind === 'oracle_rolled' && chipped.has(entry.eventId)) &&
          !(
            entry.body.kind === 'void' &&
            entry.body.rerolled !== undefined &&
            chipped.has(entry.body.rerolled)
          ),
      ),
    }))
    .filter((beat) => beat.entries.length > 0);
}

/**
 * `useCampaignLog` pages backward: each fetched page's own `beats` are
 * oldest-first, but the *pages* run newest-fetched-first (the initial page is
 * the most recent; `fetchNextPage` walks further into the past). Reversing
 * the page order before flattening gives reading order top-old/bottom-new.
 */
export function orderedBeats(pages: readonly NarrativeLog[]): readonly NarrativeBeat[] {
  return [...pages].reverse().flatMap((page) => page.beats);
}
