import { describe, expect, it } from 'vitest';

import { resolveMethodOption } from './resolve-method.js';
import { payThePrice } from './specs/index.js';

describe('resolveMethodOption', () => {
  it('resolves the highlighted table option, including its chain to Pay the Price’s oracle', () => {
    const resolved = resolveMethodOption(payThePrice, 'table');
    expect(resolved.effects).toEqual([
      {
        effect: { kind: 'oracle_roll', oracle: 'oracle:moves/pay-the-price' },
        clause: 'Roll on the table below.',
      },
    ]);
    expect(resolved.chain).toEqual({
      mode: 'auto',
      reason: 'Pay the Price, table result',
      fromOracle: 'oracle:moves/pay-the-price',
      rows: [{ min: 75, max: 81, to: 'move:suffer/endure-harm' }],
    });
  });

  it('resolves a narrative-only option (the obvious outcome) with no effects and no chain', () => {
    const resolved = resolveMethodOption(payThePrice, 'obvious');
    expect(resolved.effects).toEqual([]);
    expect(resolved.chain).toBeUndefined();
  });

  it('resolves the Ask the Oracle inspiration option with no mechanical effect', () => {
    const resolved = resolveMethodOption(payThePrice, 'oracle');
    expect(resolved.effects).toEqual([]);
  });

  it('throws for an option id the move does not offer', () => {
    expect(() => resolveMethodOption(payThePrice, 'not-a-real-option')).toThrow();
  });

  it('throws for a move with no method spec at all', () => {
    const noMethod = { moveId: payThePrice.moveId, level: 'automated' as const, outcomes: {} };
    expect(() => resolveMethodOption(noMethod, 'anything')).toThrow();
  });
});
