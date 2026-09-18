import { describe, expect, it } from 'vitest';

import type { EntityId, EventId } from '@astrolabe/shared';

import { emptyCampaignState } from './state-fixture.js';
import {
  EMPTY_SECTOR_FORM,
  applyNameRoll,
  baselineOf,
  headerProblems,
  initialSectorForm,
  setName,
  setRegion,
  toConfigureRequest,
  toDraftSnapshot,
  type SectorForm,
} from './sector-form.js';

/** Group 8: every Starting Sector transition, tested where it lives. */

const id = (n: number) => `0190f000-0000-7000-8000-00000000000${n}` as EventId;
const SECTOR = 'aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const EMBER = 'aaaa4444-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const STAR = 'aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;

const acceptedSector = (seq: number) => ({
  sectorId: SECTOR,
  name: 'Accepted Reach',
  region: 'outlands' as const,
  baseline: { settlements: 3, passages: 2 },
  provenance: 'player_written' as const,
  groundedIn: [id(1)],
  eventId: id(2),
  seq,
});

const ember = (seq: number) => ({
  kind: 'settlement' as const,
  id: EMBER,
  name: 'Ember Hold',
  location: 'deep_space' as const,
  population: 'Hundreds',
  authority: 'Corporate',
  projects: ['Rebuilding the relay'],
  provenance: 'player_written' as const,
  groundedIn: [],
  eventId: id(3),
  seq,
});

describe('opening the sector form (D-182)', () => {
  it('opens empty for a campaign with no sector', () => {
    expect(initialSectorForm(emptyCampaignState())).toEqual(EMPTY_SECTOR_FORM);
  });

  it('opens on the accepted sector, with the rolls behind its name', () => {
    const form = initialSectorForm(emptyCampaignState({ sector: acceptedSector(5) }));
    expect(form).toMatchObject({ name: 'Accepted Reach', region: 'outlands', nameRolls: [id(1)] });
  });

  it('prefers a draft saved after the sector was accepted, and not one saved before', () => {
    const drafts = (seq: number) => ({
      sector: { seq, snapshot: { name: 'Drafted Reach', region: 'expanse' as const } },
    });
    const newer = emptyCampaignState({ sector: acceptedSector(5), drafts: drafts(6) });
    const older = emptyCampaignState({ sector: acceptedSector(5), drafts: drafts(4) });

    expect(initialSectorForm(newer)).toMatchObject({ name: 'Drafted Reach', region: 'expanse' });
    expect(initialSectorForm(older)).toMatchObject({ name: 'Accepted Reach', region: 'outlands' });
  });

  it('decides per settlement, so one acceptance does not bury another’s work', () => {
    // The draft (seq 6) is older than Ember's revision (seq 7) and holds a
    // half-built second settlement: Ember reads as accepted, the other as drafted.
    const state = emptyCampaignState({
      locations: { [EMBER]: ember(7) },
      drafts: {
        sector: {
          seq: 6,
          snapshot: {
            settlements: [
              { draftId: 'd-ember', locationId: EMBER, name: 'Stale Ember' },
              { draftId: 'd-still', name: 'Still Harbor' },
            ],
          },
        },
      },
    });

    const settlements = initialSectorForm(state).settlements;
    expect(settlements.map((settlement) => settlement.name)).toEqual([
      'Ember Hold',
      'Still Harbor',
    ]);
    // The accepted settlement keeps the draft key it was built under.
    expect(settlements[0]).toMatchObject({ draftId: 'd-ember', locationId: EMBER });
  });

  it('reads the sector’s star from the accepted location (D-195)', () => {
    const state = emptyCampaignState({
      sector: { ...acceptedSector(5), starId: STAR },
      locations: {
        [STAR]: {
          kind: 'star',
          id: STAR,
          name: 'Cinder',
          details: { description: 'Smoldering red star' },
          provenance: 'player_written',
          groundedIn: [],
          eventId: id(4),
          seq: 4,
        },
      },
    });

    expect(initialSectorForm(state).star).toMatchObject({
      locationId: STAR,
      name: 'Cinder',
      description: 'Smoldering red star',
    });
  });
});

describe('the region and the name (8.1)', () => {
  it('states each region’s baseline from the rules, with its citation (A31, D-180)', () => {
    expect(baselineOf('outlands')).toMatchObject({ settlements: 3, passages: 2 });
    expect(baselineOf('terminus').citation).toMatch(/Starforged/);
  });

  it('reads a rolled prefix and suffix together, and keeps both rolls (A41)', () => {
    const form = applyNameRoll(EMPTY_SECTOR_FORM, [
      { slot: 'prefix', eventId: id(1), text: 'Ashen' },
      { slot: 'suffix', eventId: id(2), text: 'Anvil' },
    ]);
    expect(form).toMatchObject({ name: 'Ashen Anvil', nameRolls: [id(1), id(2)] });
  });

  it('drops a held name proposal when the name is rolled instead', () => {
    const form = applyNameRoll({ ...EMPTY_SECTOR_FORM, nameProposalEventId: id(9) }, [
      { slot: 'prefix', eventId: id(1), text: 'Ashen' },
      { slot: 'suffix', eventId: id(2), text: 'Anvil' },
    ]);
    expect(form.nameProposalEventId).toBeUndefined();
  });

  it('refuses to send a sector with no region or name, and names both', () => {
    expect(toConfigureRequest(EMPTY_SECTOR_FORM)).toBeNull();
    expect(headerProblems(EMPTY_SECTOR_FORM).map((problem) => problem.path)).toEqual([
      'sector.region',
      'sector.name',
    ]);
  });

  it('sends what the player states: no id, no baseline, and the star only once accepted', () => {
    const form: SectorForm = setName(setRegion(EMPTY_SECTOR_FORM, 'outlands'), '  Ashen Anvil ');
    expect(toConfigureRequest(form)).toEqual({
      sector: { name: 'Ashen Anvil', region: 'outlands' },
    });
    const withStar = { ...form, star: { ...form.star, name: 'Cinder', locationId: STAR } };
    expect(toConfigureRequest(withStar)?.sector.starId).toBe(STAR);
    const unaccepted = { ...form, star: { ...form.star, name: 'Cinder' } };
    expect(toConfigureRequest(unaccepted)?.sector).not.toHaveProperty('starId');
  });
});

describe('Save and continue (8.0i, A23)', () => {
  it('comes back as it was saved', () => {
    const form: SectorForm = {
      ...EMPTY_SECTOR_FORM,
      name: 'Ashen Anvil',
      region: 'outlands',
      nameRolls: [id(1)],
      settlements: [
        {
          draftId: 'd-deep',
          name: 'Deepwater Anchorage',
          location: 'orbital',
          population: '',
          authority: '',
          projects: ['Ice mining', ''],
          planet: {
            planetClass: 'ice',
            name: 'Hollow',
            atmosphere: '',
            observedFromSpace: '',
            feature: '',
            rolls: [],
          },
          firstLooks: [],
          trouble: '',
          rolls: [id(2)],
        },
      ],
      others: [{ draftId: 'd-drift', name: 'Kessel Drift', description: '' }],
    };

    const state = emptyCampaignState({
      drafts: { sector: { seq: 1, snapshot: toDraftSnapshot(form) } },
    });

    expect(initialSectorForm(state)).toEqual(form);
  });
});
