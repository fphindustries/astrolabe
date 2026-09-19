import type {
  AssetId,
  ChallengeRank,
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
import type { PayloadFor } from '../events/index.js';
import type { LaunchSection } from '../events/launch.js';
import type { LaunchProvenance } from '../events/provenance.js';

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
  /**
   * D-193: this character's `character.created` carried Milestone 1's granted
   * Starship (D-89). It is not in `assets`: the ship is the crew's, so the
   * fold moves the grant here rather than showing a second, per-character ship.
   */
  readonly legacyStarshipGrant?: true;
  readonly bonusNextMove?: BonusNextMove;
  /** The vows this character swore, in the order they were sworn. */
  readonly vowTrackIds: readonly TrackId[];
  /** D-124: backstory hooks the player accepted or wrote. Empty when none were. */
  readonly hooks: readonly string[];
  /** D-131: the player's words, or null when none were recorded. */
  readonly pronouns: string | null;
  /** Campaign Launch fields are absent on legacy Milestone 1 characters. */
  readonly appearance?: string;
  readonly backstory?:
    { readonly kind: 'written'; readonly text: string } | { readonly kind: 'discover_in_play' };
  readonly backgroundVow?: { readonly title: string; readonly rank: ChallengeRank };
  readonly signatureGear?: string;
  /**
   * The event that accepted this character as it now stands, and where it sits
   * in the log (D-184).
   *
   * Crew is the only launch section whose accepted facts live outside
   * `state.launch`, so a crew member cannot borrow `Accepted<T>` the way every
   * other launch fact does — these carry the same two facts for the same two
   * reasons. `eventId` is what a revision or a removal supersedes, derived
   * here rather than taken from the client; `seq` is D-182's precedence, which
   * Crew needs more than any other section because one snapshot holds the
   * whole crew and a character sits in a draft for its entire build.
   *
   * Required, and present on Milestone 1 characters too: every event has an id
   * and a sequence number, so the fold always knows both. Only `provenance`
   * and `groundedIn` below are genuinely absent on a legacy character, because
   * its `character.created` recorded neither.
   */
  readonly eventId: EventId;
  readonly seq: number;
  /** A41: how this character came to be, and the rolls it was built on. */
  readonly provenance?: LaunchProvenance;
  readonly groundedIn?: readonly EventId[];
}

/**
 * A crew member as a revision left it behind (6.0c, D-184, A26).
 *
 * The launch-relevant half of a character, and no more. A `CharacterState`
 * also carries meters, momentum, impacts and vow tracks, none of which a
 * pre-launch revision changes and all of which would grow this read model for
 * nothing — the same boundedness judgement `truthHistory` records beside
 * itself. It is a `Pick` rather than a new shape so a field added to a
 * character cannot quietly stop being remembered: the compiler asks here.
 */
export type SupersededCharacter = Pick<
  CharacterState,
  | 'name'
  | 'callsign'
  | 'stats'
  | 'assets'
  | 'hooks'
  | 'pronouns'
  | 'appearance'
  | 'backstory'
  | 'backgroundVow'
  | 'signatureGear'
  | 'eventId'
  | 'seq'
  | 'provenance'
  | 'groundedIn'
>;

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
  /**
   * Who shares the track (D-168, D-202): a shared vow's or a connection's
   * participants. `track.created` has carried them since group 2, and nothing
   * projected them until 9.0a, so the shared crew was written and unreadable.
   */
  readonly participantCharacterIds?: readonly CharacterId[];
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

/** A route between two established locations (task 4.3, D-103). The locations themselves are `entities` of `kind: 'location'`. */
export interface SectorRoute {
  readonly from: EntityId;
  readonly to: EntityId;
}

export interface SectorState {
  readonly routes: readonly SectorRoute[];
}

/**
 * A projected launch fact: the accepted payload, plus the event that set it.
 *
 * The `eventId` is what a revision supersedes and what A41 links an accepted
 * fact back to, so it belongs on the projected fact rather than being looked
 * up again.
 *
 * `seq` orders it against the section's saved draft (D-182). An accepted fact
 * and a draft can disagree — nothing clears a draft — and the only honest
 * tie-break is which was written last, which the fold knows and no reader can
 * recover afterwards.
 */
export type Accepted<T extends LaunchFactType> = PayloadFor<T> & {
  readonly eventId: EventId;
  readonly seq: number;
};

type LaunchFactType =
  | 'campaign.foundation_set'
  | 'truth.decided'
  | 'starship.established'
  | 'sector.configured'
  | 'location.added'
  | 'route.added'
  | 'trouble.established'
  | 'connection.established'
  | 'incident.accepted';

/** The snapshot a section's **Save and continue** stored (D-161). Not canon. */
export type LaunchDraftFor<S extends LaunchSection> = Extract<
  PayloadFor<'launch.draft_saved'>,
  { readonly section: S }
>['snapshot'];

/**
 * A saved draft as projected: the snapshot, and where it sits in the log.
 *
 * `seq` is the same ordering `Accepted` carries, and exists for the same
 * reason (D-182): a section's form has to know whether its draft or its
 * accepted fact was written last, or it will show one while the dashboard
 * reports the other.
 */
export interface SavedDraft<S extends LaunchSection> {
  readonly snapshot: LaunchDraftFor<S>;
  readonly seq: number;
}

/** An accepted ship as projected: no stored module list (D-191). */
export type AcceptedStarship = Omit<Accepted<'starship.established'>, 'modules'>;

/**
 * Campaign Launch facts, and only facts (D-176).
 *
 * Section statuses and blockers are **not** here: deriving them means running
 * the launch-readiness rules, and this is the output of a fold that reads no
 * rules content (task 2.7). The server's launch workspace returns them beside
 * this state, the way D-150 returns `owedPassages` beside it.
 *
 * Every member is typed to its accepted-fact payload on purpose. While these
 * were `unknown`, each reader cast its own way, so the read layer could quietly
 * stop carrying a fact — which is exactly what happened to trouble, making
 * readiness unsatisfiable with nothing failing to compile.
 */
export interface LaunchState {
  readonly phase: 'draft' | 'ready' | 'active';
  readonly drafts: { readonly [S in LaunchSection]?: SavedDraft<S> };
  readonly foundation?: Accepted<'campaign.foundation_set'>;
  readonly truthDecisions: Readonly<Record<OracleId, Accepted<'truth.decided'>>>;
  /**
   * Superseded truth decisions, oldest first, beside the current one (A26).
   *
   * `supersedesEventId` makes a revision chain, but projection is latest-wins
   * by design and `truth.decided` never reaches the narrative log, so without
   * this the earlier answer beat 2 asks for is written and unreadable.
   *
   * On boundedness, which this read model is held to (D-150, D-176): fourteen
   * keys, and a revision is a deliberate pre-activation act by one local user,
   * so the growth is bounded by how often a player changes their mind before
   * launching. That is a judgement rather than a guarantee — if it stops being
   * obviously small, the answer is a history endpoint, not a bigger state
   * payload.
   */
  readonly truthHistory: Readonly<Record<OracleId, readonly Accepted<'truth.decided'>[]>>;
  /**
   * Superseded crew members, oldest first, beside the current one (A26, A40).
   *
   * `truthHistory`'s job for the one section whose accepted facts live outside
   * this state. `character.revised` carries the full acceptance and is
   * projected latest-wins, so without this the earlier version 6.4 shows is
   * written and unreadable — the same defect, in the same shape, one section
   * later.
   *
   * A character revised before it was ever a launch character has an entry
   * with no `provenance`: a Milestone 1 `character.created` recorded none, and
   * inventing one to fill the field is exactly what A41's badge exists to
   * prevent.
   *
   * Boundedness is `truthHistory`'s judgement again: at most six keys, and a
   * revision is a deliberate pre-activation act by one local user.
   */
  readonly crewHistory: Readonly<Record<CharacterId, readonly SupersededCharacter[]>>;
  /**
   * The ship without the `modules` list older events carried: installed
   * modules are derived from the crew (D-191), so the projected fact has no
   * member a consumer could mistake for them.
   */
  readonly starship?: AcceptedStarship;
  /**
   * Superseded versions of the ship, oldest first, beside the current one
   * (7.0f, A40). `truthHistory`'s and `crewHistory`'s job for the one ship:
   * `starship.revised` is projected latest-wins, so without this the earlier
   * version beat 6's revision replaces is written and unreadable. One ship,
   * so a list rather than a map; bounded the same way, by deliberate
   * pre-activation revisions from one local user.
   */
  readonly starshipHistory: readonly AcceptedStarship[];
  readonly sector?: Accepted<'sector.configured'>;
  /**
   * The sector's superseded versions, oldest first (8.0h, A40): `truthHistory`'s
   * job for the one sector, whose region and name are revised in place.
   */
  readonly sectorHistory: readonly Accepted<'sector.configured'>[];
  readonly locations: Readonly<Record<EntityId, Accepted<'location.added'>>>;
  /**
   * Each location's superseded versions, oldest first (8.0h, A40), and a
   * removed location's final version, so what was removed stays answerable
   * as `crewHistory` keeps a removed crew member's. **Less tightly bounded
   * than the other histories**, and said so rather than claimed by analogy:
   * truths are fourteen and crew at most six, but A31 makes the sector's
   * baseline a floor, so locations have no cap, and removed ones stay here.
   * What bounds it is only that each entry is a deliberate pre-activation act
   * of one local user. If that stops being obviously small, the answer is a
   * history endpoint, not a bigger state payload (`truthHistory`'s rule).
   */
  readonly locationHistory: Readonly<Record<EntityId, readonly Accepted<'location.added'>[]>>;
  readonly routes: readonly Accepted<'route.added'>[];
  readonly layout: Readonly<Record<EntityId, { readonly x: number; readonly y: number }>>;
  readonly startingSettlementId?: EntityId;
  /** The selection's own event, so a new selection can name what it supersedes (8.0h). */
  readonly startingSettlementEventId?: EventId;
  readonly troubles: Readonly<Record<EntityId, Accepted<'trouble.established'>>>;
  /** Each trouble's superseded versions, oldest first (8.0h, A40). */
  readonly troubleHistory: Readonly<Record<EntityId, readonly Accepted<'trouble.established'>[]>>;
  readonly amendments: readonly PayloadFor<'launch.fact_amended'>[];
  /**
   * Guide and player proposals by target, newest wins. Not canon (D-161):
   * held so acceptance can resolve causality back to the proposal, and so A41
   * can link an accepted fact to the grounding it came from.
   */
  readonly proposals: Readonly<
    Record<string, PayloadFor<'creation.proposed'> & { readonly eventId: EventId }>
  >;
  readonly connection?: Accepted<'connection.established'>;
  /**
   * The Guide's latest inciting-incident options (9.0e), held so a proposal
   * survives a reload and its rolls resolve as chips (A41). Not canon
   * (D-161): nothing is an incident until the player accepts one.
   */
  readonly incidentProposal?: PayloadFor<'incident.proposed'> & {
    readonly eventId: EventId;
    readonly seq: number;
  };
  readonly incident?: Accepted<'incident.accepted'>;
  readonly activation?: {
    readonly eventId: EventId;
    readonly sessionId: SessionId;
    readonly sceneId: SceneId;
    readonly pendingVow: PayloadFor<'campaign.activated'>['pendingVow'];
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
  readonly sector: SectorState;
  readonly launch: LaunchState;
  /**
   * D-125: every AI call the campaign has paid for, in a session or not.
   * Characters are created before any session (D-77), and the session
   * counter skips those calls.
   */
  readonly tokenUsage: TokenUsage;
}
