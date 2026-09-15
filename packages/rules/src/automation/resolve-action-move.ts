import { rollAction } from '../dice/action-roll.js';
import type { ActionRollResult, RandomSource, RollAdjustment } from '../schema/dice.js';
import { resolveActionRoll } from '../outcomes/action-outcome.js';
import { withBurnOffer } from '../momentum/momentum.js';
import type { Choice, ChainSpec, MoveAutomation, TracedEffect } from '../schema/automation.js';

export interface ResolvedActionMove {
  readonly roll: ActionRollResult;
  readonly effects: readonly TracedEffect[];
  readonly choices: readonly Choice[];
  readonly chain: ChainSpec | undefined;
}

/**
 * Rolls an Automated action move and looks up the outcome its tier
 * produced. Momentum burn is folded in here (withBurnOffer) rather than
 * left to a second call, since every action move needs both the roll and
 * the burn check to show a complete result card (A4, A8) in one step.
 *
 * A move with no automation for the resulting tier (a Reference-level
 * move rolled through this path, or an incomplete spec) throws rather
 * than silently returning nothing — a missing outcome spec is a build-time
 * bug, not a runtime possibility to design around.
 */
export function resolveActionMove(
  automation: MoveAutomation,
  rng: RandomSource,
  adds: readonly RollAdjustment[],
  momentum: number,
  markedImpacts: number,
): ResolvedActionMove {
  const raw = rollAction(rng, adds);
  const roll = withBurnOffer(resolveActionRoll(raw), momentum, markedImpacts);
  const spec = automation.outcomes[roll.tier];
  if (spec === undefined) {
    throw new Error(
      `No automation outcome spec for tier "${roll.tier}" on move "${automation.moveId}"`,
    );
  }

  return {
    roll,
    effects: spec.effects,
    choices: spec.choices ?? [],
    chain: spec.chain,
  };
}
