import type { ActorKind, Timestamp } from '../envelope.js';
import type { CommandId, EventId } from '../ids.js';
import type { AstrolabeEvent } from '../events/index.js';

/**
 * The narrative log: the second read model over the same log.
 *
 * Deliberately not part of `CampaignState`. State is bounded — one campaign
 * has a fixed number of characters, tracks and entities — while the log
 * grows without limit, so one is rebuilt whole and the other is paged.
 *
 * These are the **shapes** `buildNarrativeLog` produces (D-95). The fold
 * itself stays in `server/src/projection/narrative-log.ts` — only the
 * shapes needed to render the log move here, so `web` can bind to them
 * without depending on the server package.
 *
 * Three things happen in the fold that are worth knowing when reading these
 * shapes:
 *
 * - **Grouping into beats.** Events are grouped by `commandId`, so a move
 *   resolution reads as one beat rather than five rows.
 * - **Void marking, not removal.** A voided event stays visible and struck
 *   through with its stated reason (D-27, A9, A11): `voided` and
 *   `voidedBy` carry that.
 * - **Correction folding.** D-73: a corrected passage reads as its latest
 *   revision, with the original and the player's note retained behind an
 *   affordance (`ResolvedNarration`).
 */

export interface VoidMark {
  readonly eventId: EventId;
  readonly kind: 'player_void' | 'reroll';
  readonly reason: string;
}

/** D-73: the passage as it now reads, with what it replaced kept alongside. */
export interface ResolvedNarration {
  readonly text: string;
  readonly corrected: boolean;
  readonly original?: string;
  /** The player's note — why the original was wrong. */
  readonly note?: string;
}

export interface NarrativeEntry {
  readonly event: AstrolabeEvent;
  readonly voided: boolean;
  readonly voidedBy: readonly VoidMark[];
  /** Present on `narration.written` only. */
  readonly narration?: ResolvedNarration;
  /**
   * Present on a `dice.rolled` that carried a burn offer: whether the player
   * went on to take it. A8's offer is only still live while this is false.
   */
  readonly burnTaken?: boolean;
}

/** One beat: everything one command wrote. */
export interface NarrativeBeat {
  readonly commandId: CommandId;
  /** The first seq in the beat — what the log is ordered and paged by. */
  readonly seq: number;
  readonly occurredAt: Timestamp;
  readonly actorKind: ActorKind;
  readonly entries: readonly NarrativeEntry[];
  /** True when every entry in the beat is voided, so the whole beat strikes through. */
  readonly voided: boolean;
}

export interface NarrativeLog {
  /** Oldest first, which is reading order. */
  readonly beats: readonly NarrativeBeat[];
  /**
   * Pass as `before` to fetch the previous page. Absent when the log reaches
   * its beginning.
   */
  readonly nextCursor?: number;
}

export interface NarrativeLogOptions {
  /** Return beats beginning before this seq. Omit for the most recent page. */
  readonly before?: number;
  /** Beats, not events. Default 50. */
  readonly limit?: number;
}
