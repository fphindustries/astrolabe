import { describe, expect, it } from 'vitest';

import type { EventId } from '@astrolabe/shared';

import {
  answersCurrentText,
  confidenceLabel,
  handPickPrefill,
  rollOptionKey,
  suggestionHeadline,
  suggestionPrefill,
  type MoveSuggestion,
} from './suggestion.js';

const MOVES = [{ id: 'move:adventure/gather-information' as never, name: 'Gather Information' }];

const suggestion: MoveSuggestion = {
  actorCharacterId: 'juno' as never,
  actionText: 'Juno jacks into the docking port and pulls the station logs.',
  moveId: 'move:adventure/gather-information' as never,
  rollOption: { using: 'stat', stat: 'wits' },
  triggerText: 'When you search for clues',
  reason: 'Pulling the logs is looking for clues.',
  confidence: 'high',
};

describe('the move suggestion card (7.12, D-135)', () => {
  it('headlines the move with its roll option, or nothing when no move fits', () => {
    expect(suggestionHeadline(suggestion, MOVES)).toBe('Gather Information +wits');
    const { rollOption: _omitted, ...noOption } = suggestion;
    expect(suggestionHeadline(noOption, MOVES)).toBe('Gather Information');
    expect(suggestionHeadline({ ...noOption, moveId: null }, MOVES)).toBeUndefined();
  });

  it('says the confidence in words', () => {
    expect(confidenceLabel('medium')).toBe('Medium confidence');
  });

  it('goes stale once the player changes the words it answered', () => {
    expect(answersCurrentText(suggestion, `${suggestion.actionText}  `)).toBe(true);
    expect(answersCurrentText(suggestion, 'Juno pulls the logs.')).toBe(false);
  });
});

describe('what the composer opens with', () => {
  it('keys the roll option the way the composer does', () => {
    expect(rollOptionKey({ using: 'stat', stat: 'wits' })).toBe('stat:wits');
    expect(rollOptionKey({ using: 'condition_meter', meter: 'health' })).toBe(
      'condition_meter:health',
    );
  });

  it('carries only typed words into a move picked by hand', () => {
    expect(handPickPrefill('  Rook forces the bulkhead. ')).toEqual({
      actionText: 'Rook forces the bulkhead.',
    });
    expect(handPickPrefill('   ')).toEqual({});
  });

  it('carries the suggestion, its option and its words into a move taken from it', () => {
    expect(suggestionPrefill('e1' as EventId, suggestion)).toEqual({
      actionText: suggestion.actionText,
      rollOption: { using: 'stat', stat: 'wits' },
      suggestion: { eventId: 'e1', payload: suggestion },
    });
  });
});
