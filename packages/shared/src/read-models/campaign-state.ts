import type {
  AssetId,
  CharacterId,
  ImpactId,
  MeterId,
  OracleId,
  StatId,
  TrackId,
} from '@astrolabe/rules';

import type { ActorKind, Timestamp } from '../envelope.js';
import type { CampaignId, EntityId, EventId, SceneId, SessionId } from '../ids.js';
import type { CampaignSettings } from '../events/campaign.js';

/**
 * Projected campaign state: a pure fold over the event log.
 *
 * This is the bounded, whole-campaign read model — what the play screen
 * binds to and what AI context assembly reads. The narrative log
 * (`narrative-log.ts`) is a *separate* read model, deliberately not part of
 * this one, because state is bounded and the log is not.
 *
 * These are the **shapes** the fold produces (D-95). The fold itself
 * (`project`) stays in `server/src/projection/`, behind that package's
 * purity lint fence, because it is the one that must never touch I/O, the
 * clock, or an RNG. Declaring the shapes here — rather than in `server` —
 * is what lets `web` import them: the client renders server-projected
 * state without depending on the server package (design record §9).
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
  /**
   * Set only by a manual override (`state.overridden`). `actorKind: 'player'`
   * alone cannot mark one: a player also creates characters and swears
   * vows, and a freshly created meter is not an edited one (A16).
   */
  readonly manual?: true;
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
  /** The vows this character swore, in the order they were sworn. */
  readonly vowTrackIds: readonly TrackId[];
  /** D-124: backstory hooks the player accepted or wrote. Empty when none were. */
  readonly hooks: readonly string[];
  /** D-131: the player's words, or null when none were recorded. */
  readonly pronouns: string | null;
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
  /** Uncached input tokens. */
  readonly input: number;
  readonly output: number;
  /** Input served from, and written to, the provider's prompt cache (D-113). */
  readonly cacheRead: number;
  readonly cacheWrite: number;
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
  /** D-141: the live scene-frame passage, once the scene has one. */
  readonly framedBy?: EventId;
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

/** One answered setting truth (task 4.2, D-31): keyed by which question, not a list position. */
export interface TruthAnswer {
  readonly text: string;
  readonly source: 'picked' | 'rolled' | 'written';
}

/** A route between two established locations (task 4.3, D-103). The locations themselves are `entities` of `kind: 'location'`. */
export interface SectorRoute {
  readonly from: EntityId;
  readonly to: EntityId;
}

export interface SectorState {
  readonly routes: readonly SectorRoute[];
}

/** Campaign Launch facts. Readiness is attached by the server's rules-aware read path. */
export interface LaunchState {
  readonly phase: 'draft' | 'ready' | 'active';
  readonly drafts: Readonly<Record<string, unknown>>;
  readonly foundation?: unknown;
  readonly truthDecisions: Readonly<Record<string, unknown>>;
  readonly starship?: unknown;
  readonly sector?: unknown;
  readonly locations: Readonly<Record<string, unknown>>;
  readonly routes: readonly unknown[];
  readonly layout: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  readonly startingSettlementId?: EntityId;
  readonly troubles: Readonly<Record<string, unknown>>;
  readonly amendments: readonly unknown[];
  readonly connection?: unknown;
  readonly incident?: unknown;
  readonly activation?: {
    readonly eventId: EventId;
    readonly sessionId: SessionId;
    readonly sceneId: SceneId;
  };
}

export interface CampaignState {
  readonly campaign: CampaignInfo | null;
  readonly session: SessionState | null;
  readonly scene: SceneState | null;
  readonly characters: Readonly<Record<CharacterId, CharacterState>>;
  readonly tracks: Readonly<Record<TrackId, TrackState>>;
  readonly entities: Readonly<Record<EntityId, EntityState>>;
  readonly canon: CanonState;
  readonly truths: Readonly<Record<OracleId, TruthAnswer>>;
  readonly sector: SectorState;
  readonly launch: LaunchState;
  /**
   * D-125: every AI call the campaign has paid for, in a session or not.
   * Characters are created before any session (D-77), and the session
   * counter skips those calls.
   */
  readonly tokenUsage: TokenUsage;
}
