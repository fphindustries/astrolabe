import { describe, expect, it } from 'vitest';

import type { EntityId, EventId } from '@astrolabe/shared';

import { emptyCampaignState } from './state-fixture.js';
import {
  EMPTY_SECTOR_FORM,
  addSettlement,
  applyNameRoll,
  applySettlementFieldRoll,
  applySettlementRecipe,
  discardSettlement,
  dropSettlementProposal,
  findSettlement,
  heldSettlementProposal,
  markSettlementAccepted,
  proposedSettlementFields,
  proposedSettlementGrounding,
  proposedSettlementValue,
  setProject,
  setSettlementLocation,
  setSettlementText,
  settlementFieldOracle,
  settlementProblems,
  takeSettlementProposal,
  toSettlementRequest,
  type HeldSettlementProposal,
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

describe('settlements (8.2, A32)', () => {
  const withOne = addSettlement(setRegion(EMPTY_SECTOR_FORM, 'outlands'), 'd-1');
  const complete = (form: SectorForm) => {
    let next = setSettlementText(form, 'd-1', 'name', 'Varga Relay');
    next = setSettlementLocation(next, 'd-1', 'deep_space');
    next = setSettlementText(next, 'd-1', 'population', 'Dozens');
    next = setSettlementText(next, 'd-1', 'authority', 'None');
    return setProject(next, 'd-1', 0, 'Listen to the dark');
  };

  it('reads each field Roll from the region’s own declared table (3R.5c)', () => {
    expect(settlementFieldOracle('outlands', 'population')).toBe(
      'oracle:settlements/population/outlands',
    );
    expect(settlementFieldOracle('terminus', 'location')).toBe('oracle:settlements/location');
  });

  it('turns a rolled location row into the fact’s own word, and keeps the roll', () => {
    const form = applySettlementFieldRoll(withOne, 'd-1', 'location', {
      eventId: id(1),
      text: 'Deep Space',
    });
    expect(findSettlement(form, 'd-1')).toMatchObject({ location: 'deep_space', rolls: [id(1)] });
  });

  it('starts a planet for a planetside settlement, and drops it for deep space (8.0b)', () => {
    const planetside = setSettlementLocation(withOne, 'd-1', 'planetside');
    expect(findSettlement(planetside, 'd-1')?.planet).toBeDefined();
    const deep = setSettlementLocation(planetside, 'd-1', 'deep_space');
    expect(findSettlement(deep, 'd-1')?.planet).toBeUndefined();
  });

  it('fills every field from a whole recipe roll, keeping each roll (A41)', () => {
    const form = applySettlementRecipe(withOne, 'd-1', [
      { slot: 'name', eventId: id(1), text: 'Bleakhold' },
      { slot: 'location', eventId: id(2), text: 'Orbital' },
      { slot: 'population', eventId: id(3), text: 'Thousands' },
      { slot: 'authority', eventId: id(4), text: 'Corrupt' },
      { slot: 'project_1', eventId: id(5), text: 'Mining' },
      { slot: 'project_2', eventId: id(6), text: '[Trade](id:oracle:x)' },
    ]);
    expect(findSettlement(form, 'd-1')).toMatchObject({
      name: 'Bleakhold',
      location: 'orbital',
      population: 'Thousands',
      authority: 'Corrupt',
      // Datasworn's link markup never reaches the player (5.4's lesson).
      projects: ['Mining', 'Trade'],
      rolls: [id(1), id(2), id(3), id(4), id(5), id(6)],
    });
  });

  it('names what a settlement still lacks, by the path its field uses', () => {
    const problems = settlementProblems(findSettlement(withOne, 'd-1')!);
    expect(problems.map((problem) => problem.path)).toEqual([
      'sector.settlements.d-1.name',
      'sector.settlements.d-1.location',
      'sector.settlements.d-1.population',
      'sector.settlements.d-1.authority',
      'sector.settlements.d-1.projects',
    ]);
    expect(toSettlementRequest(findSettlement(withOne, 'd-1')!)).toBeNull();
  });

  it('sends a complete settlement with no id until the server gives one (8.0a)', () => {
    const body = toSettlementRequest(findSettlement(complete(withOne), 'd-1')!);
    expect(body).toEqual({
      location: {
        kind: 'settlement',
        name: 'Varga Relay',
        location: 'deep_space',
        population: 'Dozens',
        authority: 'None',
        projects: ['Listen to the dark'],
      },
    });

    const accepted = markSettlementAccepted(complete(withOne), 'd-1', EMBER);
    expect(toSettlementRequest(findSettlement(accepted, 'd-1')!)?.locationId).toBe(EMBER);
  });

  it('sends a named planet with its settlement, one decision in one command (8.0f)', () => {
    let form = setSettlementLocation(complete(withOne), 'd-1', 'orbital');
    form = {
      ...form,
      settlements: form.settlements.map((settlement) => ({
        ...settlement,
        planet: { ...settlement.planet!, planetClass: 'ice' as const, name: 'Hollow' },
      })),
    };
    expect(toSettlementRequest(findSettlement(form, 'd-1')!)?.planet).toEqual({
      details: { kind: 'planet', name: 'Hollow', planetClass: 'ice', details: {} },
    });
  });

  it('can forget a settlement never accepted, but not one that was', () => {
    expect(discardSettlement(withOne, 'd-1').settlements).toEqual([]);
    const accepted = markSettlementAccepted(withOne, 'd-1', EMBER);
    expect(discardSettlement(accepted, 'd-1').settlements).toHaveLength(1);
  });
});

describe('a settlement proposal (8.2, D-196)', () => {
  const text = (value: string, n: number) => ({ value, reason: 'The roll.', groundedIn: [id(n)] });
  const held: HeldSettlementProposal = {
    eventId: id(9),
    targetId: 'd-1',
    rationale: 'The rolls, together.',
    proposal: {
      name: text('Deepwater Anchorage', 1),
      location: { value: 'orbital', reason: 'The roll.', groundedIn: [id(2)] },
      population: text('Thousands', 3),
      authority: text('Corporate', 4),
      projects: [text('Ice mining', 5)],
      planet: {
        planetClass: { value: 'ice', reason: 'The roll.', groundedIn: [id(6)] },
        name: text('Hollow', 7),
      },
    },
  };
  const base = addSettlement(setRegion(EMPTY_SECTOR_FORM, 'outlands'), 'd-1');
  const holding = (key: string) =>
    emptyCampaignState({
      proposals: {
        [key]: {
          targetKind: 'settlement' as const,
          targetId: key,
          proposal: held.proposal,
          rationale: 'r',
          groundedIn: [],
          eventId: id(9),
        },
      },
    });

  it('finds a proposal under the draft’s key, or the accepted settlement’s', () => {
    expect(heldSettlementProposal(holding('d-1'), { draftId: 'd-1' })?.targetId).toBe('d-1');
    expect(
      heldSettlementProposal(holding(EMBER), { draftId: 'd-1', locationId: EMBER })?.targetId,
    ).toBe(EMBER);
  });

  it('takes the whole proposal, planet included, and carries its id and key', () => {
    const settlement = findSettlement(takeSettlementProposal(base, 'd-1', held), 'd-1')!;
    expect(settlement).toMatchObject({
      name: 'Deepwater Anchorage',
      location: 'orbital',
      projects: ['Ice mining'],
      planet: { planetClass: 'ice', name: 'Hollow' },
      proposalEventId: id(9),
      proposalTargetId: 'd-1',
    });
    expect(toSettlementRequest(settlement)).toMatchObject({
      proposalEventId: id(9),
      proposalTargetId: 'd-1',
    });
  });

  it('takes one field, and lets the player drop the link and keep the words', () => {
    const taken = takeSettlementProposal(base, 'd-1', held, ['name']);
    expect(findSettlement(taken, 'd-1')).toMatchObject({
      name: 'Deepwater Anchorage',
      location: '',
    });
    const dropped = findSettlement(dropSettlementProposal(taken, 'd-1'), 'd-1')!;
    expect(dropped.name).toBe('Deepwater Anchorage');
    expect(dropped.proposalEventId).toBeUndefined();
  });

  it('restores the key a saved proposal was made under, from the fold (D-196)', () => {
    const taken = takeSettlementProposal(base, 'd-1', held);
    const state = {
      ...holding('d-1'),
      launch: {
        ...holding('d-1').launch,
        drafts: { sector: { seq: 10, snapshot: toDraftSnapshot(taken) } },
      },
    };
    expect(findSettlement(initialSectorForm(state), 'd-1')?.proposalTargetId).toBe('d-1');
  });

  it('shows each proposed field with the rolls it cites (A41)', () => {
    expect(proposedSettlementFields(held.proposal)).toContain('planet');
    expect(proposedSettlementGrounding(held.proposal, 'planet')).toEqual([id(6), id(7)]);
    expect(proposedSettlementValue(held.proposal, 'planet')).toEqual(['Hollow, a ice world']);
  });
});
