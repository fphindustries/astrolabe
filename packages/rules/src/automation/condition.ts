import type { Condition } from '../schema/automation.js';
import { STARFORGED } from '../generated/index.js';
import type { ImpactId, MeterId } from '../schema/ids.js';

/**
 * The facts a `Condition` needs about one character, kept to the same shape
 * `resolveActionMove` already uses for `markedImpacts` — primitive values the
 * caller reads off projected state, not a projection lookup of its own.
 */
export interface ConditionFacts {
  readonly hasImpact: (impact: ImpactId) => boolean;
  readonly meterValue: (meter: MeterId) => number;
}

/**
 * Evaluates a `ChoiceOption.available` guard. Only Endure Harm's
 * `not: { hasImpact: ... }` is exercised in Milestone 1, but `Condition` is
 * one union — a partial evaluator would leave the other variants to throw at
 * runtime instead of failing a build, so every variant is handled here.
 */
export function evaluateCondition(condition: Condition, facts: ConditionFacts): boolean {
  if ('hasImpact' in condition) {
    return facts.hasImpact(condition.hasImpact);
  }
  if ('meterAtMin' in condition) {
    const def = STARFORGED.gameRules.conditionMeters.find((m) => m.id === condition.meterAtMin);
    return def !== undefined && facts.meterValue(condition.meterAtMin) <= def.min;
  }
  if ('meterAtMax' in condition) {
    const def = STARFORGED.gameRules.conditionMeters.find((m) => m.id === condition.meterAtMax);
    return def !== undefined && facts.meterValue(condition.meterAtMax) >= def.max;
  }
  if ('not' in condition) {
    return !evaluateCondition(condition.not, facts);
  }
  if ('all' in condition) {
    return condition.all.every((c) => evaluateCondition(c, facts));
  }
  return condition.any.some((c) => evaluateCondition(c, facts));
}
