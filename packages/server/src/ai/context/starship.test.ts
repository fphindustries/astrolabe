import { describe, expect, it } from 'vitest';

import {
  checkStarshipProposal,
  starshipProposalRolls,
  type StarshipProposalOutput,
} from './starship.js';

/** 7.0e: what the answer schema cannot say about a ship proposal. */
describe('checkStarshipProposal', () => {
  const keys = starshipProposalRolls(2).map((slot) => slot.key);
  const valid: StarshipProposalOutput = {
    name: { value: 'Lantern Wake', reason: 'The roll.', groundedIn: ['name'] },
    appearance: { value: 'A patched hull.', reason: 'Its history.' },
    history: { value: 'Won in a wager.', reason: 'The roll.', groundedIn: ['history'] },
    quirks: [
      { value: 'Clocks run slow.', reason: 'The roll.', groundedIn: ['quirk_1'] },
      { value: 'The hatch sticks.', reason: 'The roll.', groundedIn: ['quirk_2'] },
    ],
    reason: 'The rolls, together.',
  };

  it('keys its rolls by the declared recipe slots (D-186)', () => {
    expect(keys).toEqual(['name', 'history', 'quirk_1', 'quirk_2']);
    expect(starshipProposalRolls(1).map((slot) => slot.key)).toEqual([
      'name',
      'history',
      'quirk_1',
    ]);
  });

  it('accepts a proposal that grounds every rolled field', () => {
    expect(checkStarshipProposal(valid, keys)).toBeUndefined();
  });

  it('refuses a rolled field that cites no roll', () => {
    const value = { ...valid, history: { ...valid.history, groundedIn: [] } };
    expect(checkStarshipProposal(value, keys)).toMatch(/history cites no oracle roll/);
  });

  it('refuses two quirks that say the same thing', () => {
    const value = {
      ...valid,
      quirks: [valid.quirks[0]!, { ...valid.quirks[1]!, value: 'clocks run slow.' }],
    };
    expect(checkStarshipProposal(value, keys)).toMatch(/distinct/);
  });
});
