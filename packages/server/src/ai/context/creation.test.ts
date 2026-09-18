import { describe, expect, it } from 'vitest';

import { CHARACTER_RECIPE, STARFORGED } from '@astrolabe/rules';

import {
  CHARACTER_PROPOSAL_ROLLS,
  characterProposalSchema,
  checkCharacterProposal,
} from './creation.js';

/**
 * The character proposal's grounding is one declared list (6.0h, D-186).
 *
 * The rolls used to live here as a second list beside the rules' recipes.
 * These assert that there is now one, and that the keys the schema enumerates
 * are the recipe's own slot names — because those two drifting apart is a
 * failure with no symptom until a live proposal cites a key the checker has
 * never heard of.
 */
describe('the character proposal reads its rolls from the declared recipe', () => {
  it('takes its keys, labels and oracles from CHARACTER_RECIPE', () => {
    expect(CHARACTER_PROPOSAL_ROLLS).toEqual(
      CHARACTER_RECIPE.rolls.map((slot) => ({
        key: slot.slot,
        label: slot.label ?? slot.slot,
        oracleId: slot.oracle,
      })),
    );
  });

  it('every roll names a table the frozen rules actually have', () => {
    const ids = new Set(STARFORGED.oracles.map((oracle) => oracle.id));
    for (const roll of CHARACTER_PROPOSAL_ROLLS) expect(ids.has(roll.oracleId)).toBe(true);
  });

  it('accepts a citation of any recipe slot, and refuses one it does not name', () => {
    const keys = CHARACTER_PROPOSAL_ROLLS.map((roll) => roll.key);
    const schema = characterProposalSchema(keys);

    // Both backstory prompts are citable on their own. A single slot rolled
    // twice would have collapsed them into one key (D-186).
    expect(
      schema.shape.name.safeParse({
        value: 'Vesna Kade',
        reason: 'From the rolled given name.',
        groundedIn: ['backstory-1', 'backstory-2'],
      }).success,
    ).toBe(true);
    expect(
      schema.shape.name.safeParse({
        value: 'Vesna Kade',
        reason: 'From nowhere.',
        groundedIn: ['backstory-3'],
      }).success,
    ).toBe(false);
  });

  it('reports a citation outside the recipe rather than accepting it', () => {
    const keys = CHARACTER_PROPOSAL_ROLLS.map((roll) => roll.key);
    const problems = checkCharacterProposal(
      {
        name: { value: 'Vesna Kade', reason: 'r', groundedIn: ['given-name'] },
        callsign: { value: 'Map', reason: 'r', groundedIn: ['not-a-slot'] },
        stats: { value: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 }, reason: 'r' },
        assets: [],
        backgroundVow: { title: 'Find it', rank: 'formidable', reason: 'r' },
        hooks: [{ text: 'A hook.', reason: 'r', groundedIn: ['backstory-2'] }],
        pronouns: { value: null, reason: 'r' },
      } as never,
      keys,
      'A pilot who trusts charts.',
    );

    expect(problems).toContain('not-a-slot');
  });
});
