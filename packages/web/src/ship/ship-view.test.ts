import { describe, expect, it } from 'vitest';

import type { AssetId, CharacterId, LaunchReadiness } from '@astrolabe/rules';
import type { CampaignState, CharacterState, EntityId, EventId } from '@astrolabe/shared';

import { emptyCampaignState } from '../launch/state-fixture.js';

import { blockersByField, shipHistory, shipView } from './ship-view.js';

/** 7.2: what the Starship step and the play screen show about the crew's ship. */

const SENSOR_ARRAY = 'asset:module/sensor-array' as AssetId;
const VESNA = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;

const withCrew = (state: CampaignState, assets: readonly AssetId[]): CampaignState => ({
  ...state,
  characters: {
    [VESNA]: { id: VESNA, name: 'Vesna Kade', assets } as unknown as CharacterState,
  },
});

const ship = (name: string, value = 5) => ({
  starshipId: 'aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId,
  name,
  appearance: 'A patched hull.',
  history: 'Won in a wager.',
  quirks: ['Its clocks run slow.'],
  integrity: { value, min: 0, max: 5 },
  assetId: 'asset:command-vehicle/starship' as AssetId,
  provenance: 'guide_proposal_edited' as const,
  groundedIn: [],
  eventId: 'e1' as EventId,
  seq: 3,
});

describe('shipView', () => {
  it('shows the imported starting integrity and the Starship asset before a ship is accepted', () => {
    const view = shipView(emptyCampaignState());
    expect(view.name).toBeNull();
    expect(view.integrity).toEqual({ value: 5, max: 5 });
    expect(view.asset.name).toBe('Starship');
    // Datasworn marks the first ability on from the start and the rest off.
    expect(view.asset.abilities.map((ability) => ability.enabled)).toEqual([true, false, false]);
    // Ability text reaches the reader without Datasworn's link markup.
    expect(view.asset.abilities.some((ability) => ability.text.includes('(id:'))).toBe(false);
  });

  it('shows the accepted ship’s own name and current integrity', () => {
    const view = shipView(emptyCampaignState({ starship: ship('Lantern Wake', 3) }));
    expect(view).toMatchObject({ name: 'Lantern Wake', integrity: { value: 3, max: 5 } });
  });

  it('installs a crew member’s module under their name (D-190, D-191)', () => {
    const view = shipView(withCrew(emptyCampaignState(), [SENSOR_ARRAY]));
    expect(view.modules).toEqual([
      expect.objectContaining({
        assetId: SENSOR_ARRAY,
        name: 'Sensor Array',
        ownerCharacterId: VESNA,
        ownerName: 'Vesna Kade',
      }),
    ]);
  });

  it('installs nothing a crew member does not hold', () => {
    expect(shipView(withCrew(emptyCampaignState(), [])).modules).toEqual([]);
  });
});

describe('shipHistory (A40)', () => {
  it('lists superseded versions oldest first, with their provenance in words', () => {
    const state = emptyCampaignState({
      starshipHistory: [ship('First Wake'), ship('Second Wake')],
    });
    expect(shipHistory(state).map((entry) => [entry.name, entry.provenance])).toEqual([
      ['First Wake', 'Suggested by the Guide, edited'],
      ['Second Wake', 'Suggested by the Guide, edited'],
    ]);
  });
});

describe('blockersByField (D-176)', () => {
  it('keys each server blocker by the field it names', () => {
    const readiness = {
      sections: {
        starship: {
          status: 'in_progress',
          blockers: [
            { section: 'starship', code: 'quirks_invalid', path: 'starship.quirks', message: 'Q' },
            { section: 'starship', code: 'starship_missing', path: 'starship', message: 'M' },
          ],
        },
      },
    } as unknown as LaunchReadiness;
    expect(blockersByField(readiness)).toEqual({ quirks: ['Q'], ship: ['M'] });
  });
});
