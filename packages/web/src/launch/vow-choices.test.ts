import { describe, expect, it } from 'vitest';

import type { CharacterId } from '@astrolabe/rules';
import type { CampaignState, EntityId } from '@astrolabe/shared';

import { emptyCampaignState } from './state-fixture.js';
import {
  initialVowChoices,
  sceneLocationName,
  setRoller,
  setSceneTitle,
  setSharing,
  setVowRank,
  toVowChoicesRequest,
  vowChoicesChanged,
} from './vow-choices.js';

/** 9.3: the inciting vow's choices, made on the review page (beat 12, D-200). */

const VESNA = 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;
const ROOK = 'aaaa7777-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;
const EMBER = 'aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;

function launched(incident: object): CampaignState {
  return {
    ...emptyCampaignState({
      incident: { text: 'Answer the beacon', rank: 'formidable', ...incident } as never,
      startingSettlementId: EMBER,
      locations: { [EMBER]: { name: 'Ember Hold' } } as never,
    }),
    characters: { [VESNA]: { name: 'Vesna Kade' }, [ROOK]: { name: 'Rook Ilari' } } as never,
  };
}

describe('the inciting vow’s choices (9.3)', () => {
  it('starts with no roller, the whole crew sharing, and the incident’s rank', () => {
    const choices = initialVowChoices(launched({}))!;

    expect(choices).toEqual({ participants: [VESNA, ROOK], rank: 'formidable', sceneTitle: '' });
    expect(toVowChoicesRequest(choices)).toBeNull();
    expect(initialVowChoices(emptyCampaignState())).toBeUndefined();
  });

  it('sends the choices alone, and the roller always shares the vow', () => {
    const state = launched({ participants: [ROOK] });
    let choices = setRoller(initialVowChoices(state)!, VESNA);
    expect(choices.participants).toEqual([ROOK, VESNA]);
    // The roller cannot be unticked.
    choices = setSharing(choices, VESNA, false);
    expect(choices.participants).toContain(VESNA);
    choices = setVowRank(setSceneTitle(choices, '  The dock at Ember Hold '), 'extreme');

    expect(toVowChoicesRequest(choices)).toEqual({
      incident: {
        rank: 'extreme',
        rollerId: VESNA,
        participants: [ROOK, VESNA],
        openingScene: { title: 'The dock at Ember Hold' },
      },
    });
    expect(vowChoicesChanged(state, choices)).toBe(true);
  });

  it('reads the accepted choices back, unchanged until edited', () => {
    const state = launched({
      rollerId: VESNA,
      participants: [VESNA],
      openingScene: { title: 'The dock', locationId: EMBER },
    });
    const choices = initialVowChoices(state)!;

    expect(vowChoicesChanged(state, choices)).toBe(false);
    expect(vowChoicesChanged(state, setSharing(choices, ROOK, true))).toBe(true);
  });

  it('names where the scene opens: the starting settlement (D-168)', () => {
    expect(sceneLocationName(launched({}))).toBe('Ember Hold');
    expect(sceneLocationName(emptyCampaignState())).toBeUndefined();
  });
});
