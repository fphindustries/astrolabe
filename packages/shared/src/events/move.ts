import * as z from 'zod';

import { CharacterIdSchema, EventIdSchema, MoveIdSchema, TrackIdSchema } from '../ids.js';

export const OutcomeTierSchema = z.enum(['strong_hit', 'weak_hit', 'miss']);

/** Mirrors `RollAdjustment` in `rules`: an add with the label that explains it. */
export const RollAdjustmentSchema = z.object({
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
export const RollUsingSchema = z.discriminatedUnion('using', [
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
  /**
   * D-135: the Guide's `move.suggested` this invocation was filled from.
   * A field, not `causedBy`: beat narration walks `causedBy` up to the
   * root move (D-110). The server checks it names a live suggestion for
   * this move and actor.
   */
  suggestionEventId: EventIdSchema.optional(),
});

/** D-135's bounded confidence: shown to the player, never read by anything mechanical. */
export const SuggestionConfidenceSchema = z.enum(['low', 'medium', 'high']);

/**
 * The Guide's answer to an action described without a move (task 7.12,
 * D-14, D-120, D-135). A suggestion, not a decision: it changes nothing,
 * and accepting it only fills the composer.
 *
 * `triggerText` is a verbatim quote of the move's trigger text or the
 * chosen roll option's condition text, checked with `isVerbatimClause`
 * before it is written. When no candidate move fits, `moveId` is null and
 * `reason` says why; there is then no trigger to quote.
 */
export const MoveSuggestedSchema = z.object({
  actorCharacterId: CharacterIdSchema,
  actionText: z.string().min(1),
  moveId: MoveIdSchema.nullable(),
  rollOption: z
    .discriminatedUnion('using', [
      z.object({
        using: z.literal('stat'),
        stat: z.enum(['edge', 'heart', 'iron', 'shadow', 'wits']),
      }),
      z.object({
        using: z.literal('condition_meter'),
        meter: z.enum(['health', 'spirit', 'supply']),
      }),
    ])
    .optional(),
  triggerText: z.string().min(1).optional(),
  reason: z.string().min(1),
  confidence: SuggestionConfidenceSchema,
});

/**
 * "What now?" (task 9.3, A6, D-10, D-148): three suggested actions, asked
 * for and never offered unasked. Each names the character best placed, what
 * they might do, the likely move — any move, a Reference one included — and
 * why it matters now. `anchors` are the state facts it builds on, as the
 * Guide was shown them, so an answer can be traced to current state.
 *
 * Like `move.suggested`, it changes nothing and is not narrative: using one
 * only fills the composer.
 */
export const SuggestedActionSchema = z.object({
  characterId: CharacterIdSchema,
  actionText: z.string().min(1),
  moveId: MoveIdSchema.nullable(),
  reason: z.string().min(1),
  anchors: z.array(z.string().min(1)).min(1),
});

export const ActionsSuggestedSchema = z.object({
  suggestions: z.array(SuggestedActionSchema).length(3),
});

/**
 * The Guide's note that a move's trigger may not fit the action the player
 * described (task 7.13, D-37, D-121, D-136). Written after the roll, in a
 * command caused by the `move.invoked` it remarks on, so voiding the move
 * takes the note with it. It changes nothing; the player may ignore it or
 * void and redo the move.
 *
 * `triggerText` is a verbatim quote of the move's trigger text, checked with
 * `isVerbatimClause`. A roll option's condition text never counts: the
 * stat is the player's call (D-136).
 */
export const MoveTriggerNotedSchema = z.object({
  moveId: MoveIdSchema,
  actionText: z.string().min(1),
  triggerText: z.string().min(1),
  reason: z.string().min(1),
  confidence: SuggestionConfidenceSchema,
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

/**
 * The player's pick from a `Choice` the resolved outcome offered (task 6.6).
 * `optionIds` rather than one id because `Choice.pick` allows more than one
 * (Endure Harm's weak hit is `{min: 0, max: 1}` — an empty array records
 * the player declining an optional choice, which is itself a decision worth
 * logging rather than silently writing nothing).
 *
 * The chosen option's effects ride in an accompanying `state.changed` under
 * the same `move_outcome` cause as the rest of the tier's effects — the
 * player's pick is what selected *which* effects, not a different kind of
 * cause for them.
 */
export const MoveChoiceMadeSchema = z.object({
  moveId: MoveIdSchema,
  tier: OutcomeTierSchema,
  choiceId: z.string().min(1),
  optionIds: z.array(z.string().min(1)),
  /** The `dice.rolled` event whose outcome offered this choice. */
  rollEventId: EventIdSchema,
});

/**
 * The player's pick from a `no_roll` move's `MethodSpec.options` — Pay the
 * Price's three methods (D-08's table roll highlighted as the default among
 * them). Plays the same role for a `no_roll` move that `dice.rolled` plays
 * for a rolled one: the fact of how the move resolved.
 *
 * No `invocationEventId`: this is written in the same command as the
 * `move.invoked` it resolves (one player decision — "I'm doing Pay the
 * Price via this method" — the same bundling `character.created` already
 * uses for its background vow), so the shared envelope `commandId` is
 * already the link. A field that only ever equals a sibling event's
 * commandId would be redundant, not a second source of truth.
 */
export const MoveMethodChosenSchema = z.object({
  moveId: MoveIdSchema,
  optionId: z.string().min(1),
});

/**
 * D-08/D-67/D-68: a resolved outcome or method declares a `ChainSpec` to
 * another move, `auto` (Pay the Price's table result naming a suffer move)
 * or `offer` (Face Danger's miss offering Pay the Price). Written
 * unconditionally alongside the roll or method-pick it belongs to —
 * `system` authority, no state change of its own (`EVENT_TYPE_META.
 * mutatesState: false`) — whether the player takes an `offer` chain is a
 * separate `move.invoked` for the target move, not recorded here.
 *
 * No `fromEventId`: it would name a sibling event in the same command
 * (the `dice.rolled` or `move.method_chosen` this chain belongs to), whose
 * id does not exist yet at the point this payload is built — the store
 * mints every event's id at append time (`event-store.ts`). The envelope's
 * own `commandId` already identifies "the command that offered this chain,"
 * which is exactly what a follow-up invocation needs to prove it is taking
 * a real offer rather than an invented one (`resolveChainedFrom` in
 * `move-commands.ts`) — the client already knows that `commandId`, since it
 * minted it for the call that produced this event.
 */
export const MoveChainedSchema = z.object({
  fromMoveId: MoveIdSchema,
  toMoveId: MoveIdSchema,
  mode: z.enum(['auto', 'offer']),
  reason: z.string().min(1),
});
