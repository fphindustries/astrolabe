import { describe, expect, it } from 'vitest';

import { project } from '../../projection/project.js';
import { createProviderFromEnv } from '../create-provider.js';

import {
  SUGGESTABLE_MOVES,
  SUGGESTION_RULES,
  buildMoveSuggestionRequest,
  checkMoveSuggestion,
  moveSuggestionSchema,
  renderCandidates,
  rollUsing,
  type MoveSuggestionOutput,
} from './suggestion.js';

/**
 * Task 7.12's prompt and check (D-120, D-135), without a database. What the
 * Guide is offered and what the server accepts are asserted; whether the
 * suggestion is a good one is not (§10).
 */

const ACTION = 'Juno jacks into the docking port and pulls the station logs.';

function answer(overrides: Partial<MoveSuggestionOutput> = {}): MoveSuggestionOutput {
  return {
    moveId: 'move:adventure/gather-information' as MoveSuggestionOutput['moveId'],
    rollOption: 'wits',
    triggerText: 'conduct an investigation',
    reason: 'Pulling the logs is an investigation.',
    confidence: 'high',
    ...overrides,
  };
}

describe('the move suggestion request (7.12, D-135)', () => {
  it('offers exactly the composable action moves', () => {
    expect(SUGGESTABLE_MOVES.map((move) => move.id).sort()).toEqual(
      [
        'move:adventure/face-danger',
        'move:adventure/gather-information',
        'move:adventure/secure-an-advantage',
        'move:fate/ask-the-oracle',
        'move:quest/reach-a-milestone',
        'move:quest/swear-an-iron-vow',
        'move:suffer/endure-harm',
      ].sort(),
    );
  });

  it('lists each candidate with its trigger and roll options as the rules state them', () => {
    const candidates = renderCandidates();
    expect(candidates).toContain('move:adventure/face-danger (Face Danger)');
    expect(candidates).toContain(
      'Trigger: When you attempt something risky or react to an imminent threat...',
    );
    expect(candidates).toContain('- edge: With speed, mobility, or agility');
    expect(candidates).toContain('- wits\n');
    expect(candidates).not.toContain('Pay the Price');
    expect(candidates).not.toContain('Begin a Session');
  });

  it('carries the action, the actor, and the rule against adding to either', () => {
    const request = buildMoveSuggestionRequest(
      project([]),
      { name: 'Juno Marr', callsign: 'Juno' },
      ACTION,
    );
    expect(request.purpose).toBe('move_suggestion');
    expect(request.user).toContain(`<action>\n${ACTION}\n</action>`);
    expect(request.user).toContain('<acting>Juno Marr, called Juno</acting>');
    expect(request.system[1]).toMatchObject({ cache: true });
    expect(SUGGESTION_RULES).toContain('Do not add to it');
    // D-131, found live: the first prompt gave Rook "them" in a reason.
    expect(SUGGESTION_RULES).toContain('use no pronoun at all, only their name or callsign');
  });
});

describe('the move suggestion answer (7.12, D-120, D-135)', () => {
  it('accepts a verbatim quote from the trigger or from the chosen option’s condition', () => {
    expect(checkMoveSuggestion(answer())).toBeUndefined();
    expect(
      checkMoveSuggestion(
        answer({
          moveId: 'move:adventure/face-danger' as MoveSuggestionOutput['moveId'],
          rollOption: 'shadow',
          triggerText: 'With deception, stealth, or trickery',
        }),
      ),
    ).toBeUndefined();
  });

  it('refuses a quote that is not verbatim, is too short, or comes from another option', () => {
    expect(checkMoveSuggestion(answer({ triggerText: 'conducts an investigation' }))).toMatch(
      /not in Gather Information's trigger/,
    );
    expect(checkMoveSuggestion(answer({ triggerText: 'research' }))).toMatch(
      /at least 12 characters/,
    );
    expect(
      checkMoveSuggestion(
        answer({
          moveId: 'move:adventure/face-danger' as MoveSuggestionOutput['moveId'],
          rollOption: 'shadow',
          triggerText: 'With speed, mobility, or agility',
        }),
      ),
    ).toMatch(/not in Face Danger's trigger or the chosen option’s condition/);
  });

  it('refuses a roll option the move does not have, and a missing one where the player must choose', () => {
    expect(checkMoveSuggestion(answer({ rollOption: 'iron' }))).toMatch(
      /cannot be rolled with iron; its options are wits/,
    );
    expect(
      checkMoveSuggestion(
        answer({
          moveId: 'move:adventure/face-danger' as MoveSuggestionOutput['moveId'],
          rollOption: null,
          triggerText: 'When you attempt something risky',
        }),
      ),
    ).toMatch(/needs a roll option/);
    // Ask the Oracle has no roll; Endure Harm's highest-of needs no choice.
    expect(
      checkMoveSuggestion(
        answer({
          moveId: 'move:fate/ask-the-oracle' as MoveSuggestionOutput['moveId'],
          rollOption: null,
          triggerText: 'When you seek to resolve questions',
        }),
      ),
    ).toBeUndefined();
    expect(
      checkMoveSuggestion(
        answer({
          moveId: 'move:suffer/endure-harm' as MoveSuggestionOutput['moveId'],
          rollOption: null,
          triggerText: 'When you face physical injury',
        }),
      ),
    ).toBeUndefined();
  });

  it('lets no move be suggested, with nothing to roll or quote (D-135)', () => {
    const none = answer({ moveId: null, rollOption: null, triggerText: null });
    expect(checkMoveSuggestion(none)).toBeUndefined();
    expect(checkMoveSuggestion({ ...none, triggerText: 'When you search for clues' })).toMatch(
      /must both be null/,
    );
  });

  it('constrains move and option to what exists, and confidence to three words', () => {
    const schema = moveSuggestionSchema();
    expect(schema.safeParse(answer()).success).toBe(true);
    expect(schema.safeParse(answer({ moveId: 'move:combat/strike' as never })).success).toBe(false);
    expect(schema.safeParse(answer({ confidence: 'certain' as never })).success).toBe(false);
  });

  it('spells the option the way the invocation does', () => {
    expect(rollUsing('wits')).toEqual({ using: 'stat', stat: 'wits' });
    expect(rollUsing('health')).toEqual({ using: 'condition_meter', meter: 'health' });
  });

  it('gets an answer from the dev stub that passes the check', async () => {
    const result = await createProviderFromEnv({
      ASTROLABE_AI_PROVIDER: 'stub',
    }).generateStructured(
      buildMoveSuggestionRequest(project([]), { name: 'Juno Marr', callsign: 'Juno' }, ACTION),
      moveSuggestionSchema(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(checkMoveSuggestion(result.value)).toBeUndefined();
  });
});
