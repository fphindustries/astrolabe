import { describe, expect, it } from 'vitest';

import { isVerbatimClause } from './traceability.js';

describe('isVerbatimClause', () => {
  const strongHit = 'On a __strong hit__, you are successful. Take +1 momentum.';

  it('accepts a clause that appears verbatim in the source text', () => {
    expect(isVerbatimClause('Take +1 momentum.', strongHit)).toBe(true);
  });

  it('accepts a clause equal to the whole source text', () => {
    expect(isVerbatimClause(strongHit, strongHit)).toBe(true);
  });

  it('rejects a clause that has drifted from the source text', () => {
    expect(isVerbatimClause('Take +2 momentum.', strongHit)).toBe(false);
  });

  it('rejects a clause reworded from the source text', () => {
    expect(isVerbatimClause('Take 1 momentum.', strongHit)).toBe(false);
  });

  it('rejects any clause against an empty source', () => {
    expect(isVerbatimClause('Take +1 momentum.', '')).toBe(false);
  });

  it('rejects an empty clause even against non-empty source text', () => {
    expect(isVerbatimClause('', strongHit)).toBe(false);
  });
});
