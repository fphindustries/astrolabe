import * as z from 'zod';

import { CharacterIdSchema, EventIdSchema, MoveIdSchema, TrackIdSchema } from '../ids.js';

const OutcomeTierSchema = z.enum(['strong_hit', 'weak_hit', 'miss']);

/** Mirrors `RollAdjustment` in `rules`: an add with the label that explains it. */
const RollAdjustmentSchema = z.object({
  amount: z.int(),
  /** e.g. "wits", "bonus from Secure an Advantage". */
  label: z.string().min(1),
});

/**
 * What the player rolled with. A narrowing of the rules package's
 * `RollOption` to the variants a Milestone 1 move can actually be invoked
 * with — the remaining variants (`asset_control`, `custom`, `legacy_track`)
 * belong to moves that stay at Reference until a later milestone, and get
 * added here when one of them is first rollable.
 */
const RollUsingSchema = z.discriminatedUnion('using', [
  z.object({ using: z.literal('stat'), stat: z.enum(['edge', 'heart', 'iron', 'shadow', 'wits']) }),
  z.object({
    using: z.literal('condition_meter'),
    meter: z.enum(['health', 'spirit', 'supply']),
  }),
  z.object({ using: z.literal('progress_track'), trackId: TrackIdSchema }),
]);

/**
 * The player's decision: which move, as whom, with what. Separate from the
 * roll because the two have different authorities, and because a `no_roll`
 * move (Pay the Price, Ask the Oracle) is invoked without one.
 *
 * Both events are written in the same transaction from the same request, so
 * the split costs no round trip — event granularity is not request
 * granularity (design-event-log.md section 1).
 */
export const MoveInvokedSchema = z.object({
  moveId: MoveIdSchema,
  actorCharacterId: CharacterIdSchema,
  /**
   * D-62: Aid Your Ally is a flag on an invocation, not a move of its own.
   * On a hit, effects targeting the actor resolve to this character
   * instead — applied once here at write time by `resolveEffectTarget`.
   */
  aidingAllyId: CharacterIdSchema.optional(),
  using: RollUsingSchema.optional(),
  adds: z.array(RollAdjustmentSchema),
  /** "Juno jacks into the docking port and pulls the station logs." */
  actionText: z.string().optional(),
});

/**
 * A8 / Beat 5: what the app offered, at the moment it offered it.
 *
 * `resetsTo` is `momentumResetValue(markedImpacts)` — projected state — so
 * like `state.overridden.from` it is a **historical display value**, a
 * record of the offer the player actually saw. Projection never reads it,
 * and no consistency check fires on it: after a void reprojects the log it
 * is legitimately stale.
 */
const BurnOfferSchema = z.object({
  wouldBecome: OutcomeTierSchema,
  momentum: z.int(),
  resetsTo: z.int(),
});

/**
 * The server's fact. Stores the dice **and** the resolved tier and match:
 * the redundancy is deliberate, so that a future fix to `resolveTier` can
 * never retroactively rewrite an old campaign's outcomes
 * (design-event-log.md section 2).
 */
export const DiceRolledSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('action'),
    actionDie: z.int().min(1).max(6),
    adds: z.array(RollAdjustmentSchema),
    /** Capped at 10 by the rules engine before it lands here. */
    actionScore: z.int(),
    challengeDice: z.tuple([z.int().min(1).max(10), z.int().min(1).max(10)]),
    tier: OutcomeTierSchema,
    isMatch: z.boolean(),
    burnOffer: BurnOfferSchema.optional(),
    rng: z.object({
      source: z.enum(['crypto', 'seeded']),
      seed: z.int().optional(),
    }),
  }),
  z.object({
    kind: z.literal('progress'),
    progressScore: z.int(),
    challengeDice: z.tuple([z.int().min(1).max(10), z.int().min(1).max(10)]),
    tier: OutcomeTierSchema,
    isMatch: z.boolean(),
    rng: z.object({
      source: z.enum(['crypto', 'seeded']),
      seed: z.int().optional(),
    }),
  }),
]);

/**
 * The player accepting the burn offer. Records the **fact** of burning and
 * what it bought, not the value momentum reset to: that value is
 * `momentumResetValue(markedImpacts)`, which depends on projected state, so
 * storing it would go stale the moment an upstream impact event was voided
 * (design-event-log.md section 6).
 *
 * The reset itself rides in the accompanying `state.changed` as a
 * `momentum_reset` delta, which the projector resolves through the same
 * pure function.
 */
export const MomentumBurnedSchema = z.object({
  characterId: CharacterIdSchema,
  /** The `dice.rolled` event this upgrades. */
  rollEventId: EventIdSchema,
  tierBefore: OutcomeTierSchema,
  tierAfter: OutcomeTierSchema,
});
