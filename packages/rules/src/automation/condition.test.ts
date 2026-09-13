import { describe, expect, it } from 'vitest';

import type { ImpactId, MeterId } from '../schema/ids.js';
import { evaluateCondition, type ConditionFacts } from './condition.js';

function facts(overrides: Partial<ConditionFacts> = {}): ConditionFacts {
  return {
    hasImpact: () => false,
    meterValue: () => 0,
    ...overrides,
  };
}

describe('evaluateCondition', () => {
  it('evaluates hasImpact directly', () => {
    expect(
      evaluateCondition(
        { hasImpact: 'impact:wounded' as ImpactId },
        facts({ hasImpact: (id) => id === 'impact:wounded' }),
      ),
    ).toBe(true);
  });

  it("evaluates Endure Harm's not-wounded guard (D-59)", () => {
    const condition = { not: { hasImpact: 'impact:wounded' as ImpactId } };
    expect(evaluateCondition(condition, facts({ hasImpact: () => false }))).toBe(true);
    expect(evaluateCondition(condition, facts({ hasImpact: () => true }))).toBe(false);
  });

  it('evaluates meterAtMin/meterAtMax against the meter’s declared bounds', () => {
    const atMin = { meterAtMin: 'health' as MeterId };
    const atMax = { meterAtMax: 'health' as MeterId };
    expect(evaluateCondition(atMin, facts({ meterValue: () => 0 }))).toBe(true);
    expect(evaluateCondition(atMin, facts({ meterValue: () => 1 }))).toBe(false);
    expect(evaluateCondition(atMax, facts({ meterValue: () => 5 }))).toBe(true);
    expect(evaluateCondition(atMax, facts({ meterValue: () => 4 }))).toBe(false);
  });

  it('evaluates all/any composition', () => {
    const impact = 'impact:wounded' as ImpactId;
    const bothTrue = facts({ hasImpact: () => true, meterValue: () => 0 });
    expect(
      evaluateCondition(
        { all: [{ hasImpact: impact }, { meterAtMin: 'health' as MeterId }] },
        bothTrue,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { any: [{ hasImpact: impact }, { meterAtMax: 'health' as MeterId }] },
        facts({ hasImpact: () => false, meterValue: () => 0 }),
      ),
    ).toBe(false);
  });
});
