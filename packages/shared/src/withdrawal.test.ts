import { describe, expect, it } from 'vitest';

import { withdrawalReason } from './withdrawal.js';

const violation = (rule: Parameters<typeof withdrawalReason>[0][number]['rule'], why = 'Why.') => ({
  rule,
  character: 'Rook',
  segment: null,
  quote: rule === 'segment_check' || rule === 'unchecked' ? '' : 'a quote',
  why,
});

describe('withdrawalReason (D-128)', () => {
  it('says why in words, naming the character', () => {
    expect(withdrawalReason([violation('undeclared_action')])).toBe(
      'Withdrawn: it had Rook do something the player didn’t declare.',
    );
    expect(withdrawalReason([violation('player_interior')])).toBe(
      'Withdrawn: it said what Rook thinks, feels or characteristically does, which is the player’s to decide.',
    );
    expect(withdrawalReason([violation('voice')])).toMatch(/gave Rook words or expression/);
    expect(withdrawalReason([violation('injury')])).toMatch(
      /injury to Rook other than the one established/,
    );
    expect(withdrawalReason([violation('unchecked')])).toBe(
      'Withdrawn: it could not be checked, and an unchecked passage is never kept.',
    );
  });

  it('uses a segment check’s own words, and counts the rest', () => {
    expect(
      withdrawalReason([
        violation(
          'segment_check',
          'A world segment named Rook; what happens to a player character must be labelled as theirs.',
        ),
        violation('voice'),
        violation('injury'),
      ]),
    ).toBe(
      'Withdrawn: a world segment named Rook; what happens to a player character must be labelled as theirs, and 2 more problems.',
    );
  });
});
