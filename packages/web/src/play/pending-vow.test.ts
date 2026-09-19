import { describe, expect, it } from 'vitest';

import type { CharacterId } from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';

import { emptyCampaignState } from '../launch/state-fixture.js';

import { pendingVowView } from './pending-vow.js';

/** 9.4: play offers the pending vow until it is sworn (D-201). */

const VESNA = 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;
const ROOK = 'aaaa7777-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;

function activated(vowTrackId?: string): CampaignState {
  return {
    ...emptyCampaignState({
      incident: { text: 'Answer the beacon', rank: 'formidable' } as never,
      activation: {
        pendingVow: {
          incidentId: 'inc',
          rank: 'formidable',
          rollerId: VESNA,
          participants: [VESNA, ROOK],
        },
        ...(vowTrackId === undefined ? {} : { vowTrackId }),
      } as never,
    }),
    characters: { [VESNA]: { name: 'Vesna Kade' }, [ROOK]: { name: 'Rook Ilari' } } as never,
  };
}

describe('the pending vow in play (9.4)', () => {
  it('offers the vow to its roller, with its words, rank and who else shares it', () => {
    expect(pendingVowView(activated())).toEqual({
      rollerId: VESNA,
      rollerName: 'Vesna Kade',
      text: 'Answer the beacon',
      rank: 'formidable',
      sharedWith: ['Rook Ilari'],
    });
  });

  it('offers nothing before launch or once the vow is sworn', () => {
    expect(pendingVowView(emptyCampaignState())).toBeUndefined();
    expect(pendingVowView(activated('track-1'))).toBeUndefined();
  });
});
