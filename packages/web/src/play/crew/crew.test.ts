import { describe, expect, it } from 'vitest';

import type { AdaptedRuleset, AssetId, CharacterId, ImpactId, TrackId } from '@astrolabe/rules';
import type { CharacterState, FieldProvenance, TrackState } from '@astrolabe/shared';

import { toCharacterSheet, toCrewCard } from './crew.js';

const PROVENANCE: FieldProvenance = {
  eventId: 'evt-1' as never,
  actorKind: 'system',
  at: '2026-01-01T00:00:00.000Z' as never,
};

function character(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: 'char-vesna' as CharacterId,
    name: 'Vesna Kade',
    callsign: 'Vesna',
    stats: { edge: 2, heart: 2, iron: 3, shadow: 1, wits: 2 },
    meters: {
      health: { value: 4, min: 0, max: 5, lastChangedBy: PROVENANCE },
      spirit: { value: 5, min: 0, max: 5, lastChangedBy: PROVENANCE },
      supply: { value: 5, min: 0, max: 5, lastChangedBy: PROVENANCE },
    },
    momentum: { value: 7, max: 10, resetValue: 2, lastChangedBy: PROVENANCE },
    impacts: {},
    markedImpacts: 0,
    assets: [],
    vowTrackIds: [],
    ...overrides,
  };
}

const RULES: AdaptedRuleset = {
  gameRules: {
    conditionMeters: [],
    impacts: [
      { id: 'impact:misfortunes/cursed' as ImpactId, category: 'misfortunes', label: 'Cursed' },
    ],
    specialTracks: [],
  },
  moves: [],
  oracles: [],
  assets: [{ id: 'asset:path/bold' as AssetId, name: 'Bold' } as AdaptedRuleset['assets'][number]],
  assetCategories: [],
};

describe('toCrewCard', () => {
  it('exposes only callsign, health and momentum (D-42)', () => {
    expect(toCrewCard(character())).toEqual({
      characterId: 'char-vesna',
      callsign: 'Vesna',
      health: { value: 4, max: 5 },
      momentum: { value: 7, max: 10 },
    });
  });
});

describe('toCharacterSheet', () => {
  it('resolves asset names and impact labels from the rules, not the character', () => {
    const sheet = toCharacterSheet(
      character({
        assets: ['asset:path/bold' as AssetId],
        impacts: { ['impact:misfortunes/cursed' as ImpactId]: true },
        markedImpacts: 1,
      }),
      RULES,
      {},
    );

    expect(sheet.assets).toEqual([{ id: 'asset:path/bold', name: 'Bold' }]);
    expect(sheet.markedImpacts).toEqual([{ id: 'impact:misfortunes/cursed', label: 'Cursed' }]);
  });

  it('falls back to the id when the rules have no matching entry', () => {
    const sheet = toCharacterSheet(
      character({ assets: ['asset:path/unknown' as AssetId] }),
      RULES,
      {},
    );
    expect(sheet.assets).toEqual([{ id: 'asset:path/unknown', name: 'asset:path/unknown' }]);
  });

  it('resolves vow titles and ticks from projected tracks', () => {
    const vowId = 'trk-1' as TrackId;
    const tracks: Readonly<Record<TrackId, TrackState>> = {
      [vowId]: {
        id: vowId,
        kind: 'vow',
        title: "Recover the flight recorder of Meridian's Hope",
        rank: 'formidable',
        ticks: 8,
        maxTicks: 40,
        lastChangedBy: PROVENANCE,
      },
    };

    const sheet = toCharacterSheet(character({ vowTrackIds: [vowId] }), RULES, tracks);

    expect(sheet.vows).toEqual([
      {
        trackId: vowId,
        title: "Recover the flight recorder of Meridian's Hope",
        ticks: 8,
        maxTicks: 40,
      },
    ]);
  });

  it('omits bonusNextMove when the character has none', () => {
    const sheet = toCharacterSheet(character(), RULES, {});
    expect(sheet.bonusNextMove).toBeUndefined();
  });

  it('carries an aid-your-ally bonus through, excludes included', () => {
    const sheet = toCharacterSheet(
      character({
        bonusNextMove: { amount: 1, excludes: 'progress_moves', sourceEventId: 'evt-2' as never },
      }),
      RULES,
      {},
    );
    expect(sheet.bonusNextMove).toEqual({ amount: 1, excludes: 'progress_moves' });
  });
});
