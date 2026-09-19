import * as z from 'zod';
import { CHALLENGE_RANKS } from '@astrolabe/rules';

import { ChangeCauseSchema } from '../cause.js';
import { CharacterIdSchema, TrackIdSchema } from '../ids.js';

/**
 * Starforged's five challenge ranks. A game constant rather than imported
 * content — Datasworn ships the ranks inside move and oracle prose, not as
 * a structured field the adapter could import, so there is nothing in
 * `STARFORGED` to reference.
 *
 * The rank-to-ticks lookup that Reach a Milestone needs belongs in `rules`
 * when the move flow needs it. The event log never performs it: a tick
 * count is resolved at write time and stored, so projection does no rank
 * arithmetic at all.
 */
export const ChallengeRankSchema = z.enum(CHALLENGE_RANKS);

export type ChallengeRank = z.infer<typeof ChallengeRankSchema>;

/**
 * Vows, clocks and expeditions are all tracks, which is why they share one
 * pair of event types. They differ in how they are sized: a vow by its
 * challenge rank, a clock by its segment count (Beat 8's is four).
 */
export const TrackCreatedSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('vow'),
    trackId: TrackIdSchema,
    title: z.string().min(1),
    rank: ChallengeRankSchema,
    /**
     * The character who swore it. Vows are per-character in Starforged, and
     * the pressure rail groups them that way.
     *
     * Optional rather than required, which is what keeps this a
     * non-breaking payload change: a campaign written before the field
     * existed still projects, with its vows unattributed.
     */
    characterId: CharacterIdSchema.optional(),
    /** D-168: one vow can be shared while retaining one swearing character. */
    participantCharacterIds: z.array(CharacterIdSchema).min(1).optional(),
  }),
  z.object({
    kind: z.literal('expedition'),
    trackId: TrackIdSchema,
    title: z.string().min(1),
    rank: ChallengeRankSchema,
  }),
  z.object({
    kind: z.literal('clock'),
    trackId: TrackIdSchema,
    title: z.string().min(1),
    segments: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
    /** A14: the AI owns clocks, and always with a stated reason. */
    cause: ChangeCauseSchema,
  }),
]);

/**
 * The one way a track moves, whatever caused it — a move outcome marking
 * progress, or the AI filling a clock segment (Beat 8). One event type per
 * target aggregate is what lets the tracker panel read a single type, and
 * what gives Beat 8's hover ("who ticked it and why") one place to look.
 *
 * Ticks, not boxes or segments. Converting a rank into ticks is rules
 * content, resolved at write time; the projector only ever adds.
 */
export const TrackAdvancedSchema = z.object({
  trackId: TrackIdSchema,
  ticks: z.int(),
  cause: ChangeCauseSchema,
  /** The verbatim rule clause, where a rule rather than AI judgement caused it. */
  clause: z.string().min(1).optional(),
});

/**
 * A track's own words changed (D-188).
 *
 * Only the words. `reviseCharacter` makes a background vow editable before
 * launch, and D-105 wrote the vow and its track as one decision — so a revised
 * vow has to reach its track or the two disagree permanently. There is no
 * undoing `track.created`: void is bounded to the current session (D-84) and
 * every pre-launch event has a null session, so `planVoid` refuses.
 *
 * Rename, not re-swear. Progress, kind and owner are untouched, and abandoning
 * a vow is a different act that this event does not express. `rank` is absent
 * for a clock, which has none.
 */
export const TrackRevisedSchema = z.object({
  trackId: TrackIdSchema,
  title: z.string().min(1),
  rank: ChallengeRankSchema.optional(),
  /**
   * D-202: who shares the track, replaced whole when given. A connection's
   * sharing crew can change before launch; progress, kind and the swearing
   * character still cannot change here.
   */
  participantCharacterIds: z.array(CharacterIdSchema).min(1).optional(),
});
