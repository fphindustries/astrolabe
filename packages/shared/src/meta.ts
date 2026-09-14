import type { CharacterId, TrackId } from '@astrolabe/rules';

import { PAYLOAD_SCHEMAS, type EventType, type PayloadFor } from './events/index.js';
import type { EntityId } from './ids.js';

/**
 * Per-type metadata: what each event type means to a reader, and what it
 * points at.
 *
 * This lives in code rather than in a column, deliberately. "Is this event
 * narrative?" is a view concern, and putting it in the log would mean a
 * migration every time the narrative log's composition changed — and would
 * freeze an old campaign's rows at whatever answer was true when they were
 * written.
 */

/** Something an event can point at, and that a void therefore has to account for. */
export type EntityRef =
  | { readonly kind: 'entity'; readonly id: EntityId }
  | { readonly kind: 'track'; readonly id: TrackId }
  | { readonly kind: 'character'; readonly id: CharacterId };

export interface EventTypeMeta<T extends EventType> {
  /** Rendered in the narrative log (task 5.4). */
  readonly narrative: boolean;
  /** Worth carrying into a recap of a past session (A1, D-72). */
  readonly significant: boolean;
  /**
   * Changes projected state, so voiding it changes numbers.
   *
   * Checked, not claimed: `projection/mutates-state.test.ts` asserts for
   * every type that this is true exactly when appending such an event
   * changes the projection. That test is what caught `move.invoked`, which
   * looks inert but spends the aided character's `bonusNextMove` (Beat 5).
   *
   * `dice.rolled` is genuinely false. A roll's numbers and its A8 burn offer
   * belong to the beat the player is reading, which is the narrative log
   * read model — not this bounded, whole-campaign one.
   */
  readonly mutatesState: boolean;
  /**
   * Exempt from void (D-85). Only token accounting is: the tokens were
   * spent whatever the fiction now says.
   */
  readonly voidable: boolean;
  /**
   * What this event **introduces** — an entity or track that did not exist
   * before it.
   */
  readonly introduces: (payload: PayloadFor<T>) => readonly EntityRef[];
  /**
   * What this event **refers to** without introducing.
   *
   * This is what makes D-83's referential containment checkable rather than
   * aspirational: a void is refused when a non-voided event outside the
   * cascade refers to something introduced inside it. Without a per-type
   * declaration there is no way to ask that question.
   */
  readonly references: (payload: PayloadFor<T>) => readonly EntityRef[];
}

const entity = (id: EntityId): EntityRef => ({ kind: 'entity', id });
const track = (id: TrackId): EntityRef => ({ kind: 'track', id });
const character = (id: CharacterId): EntityRef => ({ kind: 'character', id });

const none = (): readonly EntityRef[] => [];

type MetaTable = { readonly [T in EventType]: EventTypeMeta<T> };

export const EVENT_TYPE_META: MetaTable = {
  'campaign.created': {
    narrative: false,
    significant: false,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: none,
  },
  'character.created': {
    narrative: false,
    significant: false,
    mutatesState: true,
    voidable: true,
    introduces: (p) => [character(p.characterId)],
    references: none,
  },
  'character.proposed': {
    // D-124: a suggestion the player has not accepted. It happens before any
    // session (D-77), so it belongs to no beat, and it changes nothing until
    // `character.created` names it as its cause.
    narrative: false,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'session.began': {
    narrative: false,
    significant: true,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: none,
  },
  'session.ended': {
    narrative: true,
    significant: true,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: none,
  },
  'scene.started': {
    narrative: true,
    significant: true,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: (p) => (p.locationId === undefined ? [] : [entity(p.locationId)]),
  },
  'move.invoked': {
    narrative: true,
    significant: true,
    // Spends the aided character's bonusNextMove (Beat 5) — inert-looking
    // but not inert. Caught by projection/mutates-state.test.ts.
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: (p) => [
      character(p.actorCharacterId),
      ...(p.aidingAllyId === undefined ? [] : [character(p.aidingAllyId)]),
      ...(p.using?.using === 'progress_track' ? [track(p.using.trackId)] : []),
    ],
  },
  'dice.rolled': {
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'momentum.burned': {
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: (p) => [character(p.characterId)],
  },
  'move.choice_made': {
    // The chosen option's effects ride in an accompanying `state.changed`
    // (move.ts's own comment) — this event is the fact of the pick.
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'move.method_chosen': {
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'move.chained': {
    // Declares a possible chain; taking an `offer` chain is a separate
    // `move.invoked` for the target move, not a mutation here.
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'oracle.rolled': {
    // Same treatment as `dice.rolled`: the roll belongs to the narrative
    // log's beat, not to bounded campaign state.
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'amount.proposed': {
    // The AI's suggestion, shown in the beat so the player sees what they
    // adjusted from (A13). The commitment is a separate player event.
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: (p) => [character(p.characterId)],
  },
  'amount.committed': {
    // The meter delta rides in an accompanying `state.changed` under a
    // `preroll_effect` cause (amount.ts's own comment) — same split as
    // `momentum.burned`/its `state.changed(momentum_reset)`.
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: (p) => [character(p.characterId)],
  },
  'state.changed': {
    narrative: false,
    significant: false,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: (p) => p.changes.map((c) => character(c.delta.characterId)),
  },
  'state.overridden': {
    narrative: true,
    significant: false,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: (p) =>
      p.target.kind === 'track' ? [track(p.target.trackId)] : [character(p.target.characterId)],
  },
  'track.created': {
    narrative: true,
    significant: true,
    mutatesState: true,
    voidable: true,
    introduces: (p) => [track(p.trackId)],
    references: (p) =>
      p.kind === 'vow' && p.characterId !== undefined ? [character(p.characterId)] : [],
  },
  'track.advanced': {
    narrative: true,
    significant: true,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: (p) => [track(p.trackId)],
  },
  'entity.established': {
    narrative: true,
    significant: true,
    mutatesState: true,
    voidable: true,
    introduces: (p) => [entity(p.entityId)],
    references: none,
  },
  'narration.written': {
    narrative: true,
    significant: true,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'narration.correction_requested': {
    narrative: false,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'narration.revised': {
    narrative: false,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'narration.withdrawn': {
    // D-128: a withdrawal stays in the log, struck, with its reason. Voidable
    // like the passage it sits beside, so voiding the beat takes it too.
    narrative: true,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: none,
  },
  'event.voided': {
    narrative: true,
    significant: false,
    mutatesState: true,
    voidable: false,
    introduces: none,
    references: none,
  },
  'ai.completed': {
    narrative: false,
    significant: false,
    mutatesState: true,
    voidable: false,
    introduces: none,
    references: none,
  },
  'ai.failed': {
    // Accounting, like `ai.completed`: exempt from void (D-85), and never a
    // beat in its own right — the play screen shows the pause (D-116).
    narrative: false,
    significant: false,
    mutatesState: true,
    voidable: false,
    introduces: none,
    references: none,
  },
  'truth.set': {
    // Setup bookkeeping, not a play-screen beat — the golden session's
    // narrative log starts at session 2, after campaign setup is done.
    narrative: false,
    significant: false,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: none,
  },
  'sector.route_added': {
    narrative: false,
    significant: false,
    mutatesState: true,
    voidable: true,
    introduces: none,
    references: (p) => [entity(p.fromLocationId), entity(p.toLocationId)],
  },
  'incident.proposed': {
    // D-132: a suggestion, like `character.proposed`. It changes nothing
    // until a vow names it as its cause, and it belongs to no beat.
    narrative: false,
    significant: false,
    mutatesState: false,
    voidable: true,
    introduces: none,
    references: (p) =>
      p.options.flatMap((option) => [
        ...option.drawsOn.locations.map(entity),
        ...option.drawsOn.characters.map(character),
      ]),
  },
};

/** The event types the narrative log renders (task 5.4's query). */
export const NARRATIVE_EVENT_TYPES: readonly EventType[] = (
  Object.keys(PAYLOAD_SCHEMAS) as EventType[]
).filter((type) => EVENT_TYPE_META[type].narrative);

/** The event types a recap of a past session draws on (A1, D-72). */
export const SIGNIFICANT_EVENT_TYPES: readonly EventType[] = (
  Object.keys(PAYLOAD_SCHEMAS) as EventType[]
).filter((type) => EVENT_TYPE_META[type].significant);
