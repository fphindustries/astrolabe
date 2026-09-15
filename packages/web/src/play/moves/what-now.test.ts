import { describe, expect, it } from 'vitest';

import { MOVE_AUTOMATION_SPECS, STARFORGED, type CharacterId, type MoveId } from '@astrolabe/rules';

import { isComposerPlayable, toSuggestedActionView } from './what-now.js';

const ROOK = 'rook' as CharacterId;
const crew = [{ characterId: ROOK, callsign: 'Rook' }];
const suggestion = (moveId: string | null) => ({
  characterId: ROOK,
  actionText: 'Rook secures the airlock before anyone goes deeper.',
  moveId: moveId as never,
  reason: 'The crew is about to split up.',
  anchors: ['The scene: The derelict relay station, at Varga Relay.'],
});

describe('"What now?" views (D-148)', () => {
  it('plays an automated move in the composer, and sends anything else to the rules', () => {
    const playable = (id: string) => isComposerPlayable(id as MoveId, MOVE_AUTOMATION_SPECS);
    expect(playable('move:adventure/secure-an-advantage')).toBe(true);
    // Reference only (D-59), resolved by a method, or with no outcome automation.
    expect(playable('move:exploration/undertake-an-expedition')).toBe(false);
    expect(playable('move:fate/pay-the-price')).toBe(false);
    expect(playable('move:quest/reach-a-milestone')).toBe(false);
  });

  it('names the character and the move, and says when no move fits', () => {
    const view = toSuggestedActionView(
      suggestion('move:exploration/undertake-an-expedition'),
      crew,
      STARFORGED.moves,
      MOVE_AUTOMATION_SPECS,
    );
    expect(view).toMatchObject({
      callsign: 'Rook',
      moveName: 'Undertake an Expedition',
      playable: false,
    });
    expect(
      toSuggestedActionView(suggestion(null), crew, STARFORGED.moves, MOVE_AUTOMATION_SPECS),
    ).toMatchObject({ moveName: undefined, playable: false });
  });
});
