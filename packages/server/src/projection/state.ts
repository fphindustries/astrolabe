import type { AssetId, CharacterId, ImpactId, MeterId, StatId, TrackId } from '@astrolabe/rules';
import type {
  ActorKind,
  CampaignId,
  CampaignSettings,
  EntityId,
  EventId,
  SceneId,
  SessionId,
  Timestamp,
} from '@astrolabe/shared';

/**
 * Projected campaign state: a pure fold over the event log.
 *
 * This is the bounded, whole-campaign read model — what the play screen
 * binds to and what AI context assembly reads. The narrative log is a
 * *separate* read model (task 2.4b), deliberately not part of this one,
 * because state is bounded and the log is not.
 *
 * What is stored here versus derived is the load-bearing distinction:
 * **store facts, derive bounds.** A momentum *value* was produced by
 * applying a rule at a moment in history and must never change. A momentum
 * *maximum* is a current-rules bound and should track the current rules, so
 * it is recomputed from marked impacts on every projection (D-74, D-78,
 * D-79).
 */

/** Why a projected field holds the value it does — A16's badge, and Beat 8's hover. */
export interface FieldProvenance {
  readonly eventId: EventId;
  /**
   * `player` means a human typed it (a manual override), `system` means the
   * rules engine applied it, `ai` means the Guide owns it. This is what A16
   * needs to show a manual override differently from an automated change.
   */
  readonly actorKind: ActorKind;
  readonly reason?: string;
  readonly at: Timestamp;
}

export interface MeterState {
  readonly value: number;
  /** Snapshotted at creation, never read from the rules data (see project.ts). */
  readonly min: number;
  readonly max: number;
  readonly lastChangedBy: FieldProvenance;
}

export interface MomentumState {
  /** Stored: folded from deltas, resets and overrides. */
  readonly value: number;
  /** Derived: 10 minus marked impacts, floored at 0 (D-74, D-79). */
  readonly max: number;
  /** Derived: 2 minus marked impacts, floored at 0 (D-74, D-79). */
  readonly resetValue: number;
  readonly lastChangedBy: FieldProvenance;
}

/** Beat 5's +1 on the aided ally's next move, held until it is spent. */
export interface BonusNextMove {
  readonly amount: number;
  readonly excludes?: 'progress_moves';
  readonly sourceEventId: EventId;
}

export interface CharacterState {
  readonly id: CharacterId;
  readonly name: string;
  readonly callsign: string;
  readonly stats: Readonly<Record<StatId, number>>;
  readonly meters: Readonly<Record<MeterId, MeterState>>;
  readonly momentum: MomentumState;
  /** Only marked impacts are present. */
  readonly impacts: Readonly<Record<ImpactId, true>>;
  readonly markedImpacts: number;
  readonly assets: readonly AssetId[];
  readonly bonusNextMove?: BonusNextMove;
}

export type TrackKind = 'vow' | 'expedition' | 'clock';

export interface TrackState {
  readonly id: TrackId;
  readonly kind: TrackKind;
  readonly title: string;
  /** Vows and expeditions carry a challenge rank; clocks do not. */
  readonly rank?: string;
  /**
   * Progress in the track's own unit: a segment for a clock, a progress
   * tick for a vow or expedition. Converting a rank into ticks is rules
   * content, resolved at write time — the projector only ever adds.
   */
  readonly ticks: number;
  readonly maxTicks: number;
  readonly lastChangedBy: FieldProvenance;
}

export interface EntityState {
  readonly id: EntityId;
  readonly kind: 'npc' | 'location' | 'faction' | 'ship';
  readonly name: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly provenance: {
    /** A10's badge. */
    readonly establishedBy: 'ai' | 'player';
    readonly recipeId?: string;
    /** The oracle roll events this was built from — how the card links to its chips. */
    readonly groundedIn: readonly EventId[];
    readonly eventId: EventId;
  };
}

export interface TokenUsage {
  readonly input: number;
  readonly output: number;
}

export interface SessionState {
  readonly id: SessionId;
  readonly number: number;
  readonly startedAt: Timestamp;
  readonly endedAt?: Timestamp;
  /** D-75: a projection over `ai.completed`, so it survives reload and resumption. */
  readonly tokenUsage: TokenUsage;
}

export interface SceneState {
  readonly id: SceneId;
  readonly title: string;
  readonly locationId?: EntityId;
}

/** A17: what the next session's recap is built from. */
export interface SessionSummary {
  readonly number: number;
  readonly summary: string;
  readonly openThreads: readonly string[];
}

export interface CampaignInfo {
  readonly id: CampaignId;
  readonly name: string;
  readonly settings: CampaignSettings;
}

export interface CanonState {
  /** Oldest first. The recap reads the last one. */
  readonly sessionSummaries: readonly SessionSummary[];
}

export interface CampaignState {
  readonly campaign: CampaignInfo | null;
  readonly session: SessionState | null;
  readonly scene: SceneState | null;
  readonly characters: Readonly<Record<CharacterId, CharacterState>>;
  readonly tracks: Readonly<Record<TrackId, TrackState>>;
  readonly entities: Readonly<Record<EntityId, EntityState>>;
  readonly canon: CanonState;
}

/**
 * The state of a campaign whose log is empty. Projecting `[]` returns this
 * rather than throwing: an empty log is a real state, not an error.
 */
export function emptyState(): CampaignState {
  return {
    campaign: null,
    session: null,
    scene: null,
    characters: {},
    tracks: {},
    entities: {},
    canon: { sessionSummaries: [] },
  };
}

/**
 * A progress track is ten boxes of four ticks. A game constant rather than
 * imported content — Datasworn carries it in prose, not as a field — and a
 * constant is code, which the projector may use. Versioned rules *data* is
 * what it may not read.
 */
export const PROGRESS_TRACK_MAX_TICKS = 40;
