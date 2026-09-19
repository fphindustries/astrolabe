import { describe, expect, it } from 'vitest';

import {
  checkSettlementProposal,
  settlementProposalRolls,
  troubleProposalRolls,
  type SettlementProposalOutput,
} from './sector.js';

/** 8.0e: what the answer schema cannot say about a settlement proposal. */
describe('checkSettlementProposal', () => {
  const rolled = [
    { key: 'name', label: 'Name', rowText: 'Bleakhold' },
    { key: 'location', label: 'Location', rowText: 'Orbital' },
    { key: 'population', label: 'Population', rowText: 'Thousands' },
    { key: 'authority', label: 'Authority', rowText: 'Corrupt' },
    { key: 'project_1', label: 'Projects', rowText: 'Mining' },
    { key: 'planet_class', label: 'Planet Class', rowText: '[Ice World](id:oracle:planets/ice)' },
    { key: 'planet_name', label: 'Name', rowText: 'Hollow' },
  ];
  const cite = (key: string, value: string) => ({ value, reason: 'The roll.', groundedIn: [key] });
  const valid: SettlementProposalOutput = {
    name: cite('name', 'Bleakhold'),
    location: { ...cite('location', 'orbital'), value: 'orbital' },
    population: cite('population', 'Thousands'),
    authority: cite('authority', 'Corrupt'),
    projects: [cite('project_1', 'Ice mining')],
    planet: {
      planetClass: { ...cite('planet_class', 'ice'), value: 'ice' },
      name: cite('planet_name', 'Hollow'),
    },
    firstLooks: null,
    reason: 'The rolls, together.',
  };

  it('keys its rolls by the declared recipe slots, prefixing the planet’s (D-186)', () => {
    expect(
      settlementProposalRolls({
        region: 'outlands',
        projectCount: 1,
        planetClass: 'ice',
        firstLookCount: 2,
      }).map((slot) => slot.key),
    ).toEqual([
      'name',
      'location',
      'population',
      'authority',
      'project_1',
      'planet_class',
      'planet_name',
      'first_look_1',
      'first_look_2',
    ]);
    // A settlement trouble is its own proposal (D-194), not a settlement field.
    expect(troubleProposalRolls('settlement').map((slot) => slot.oracleId)).toEqual([
      'oracle:settlements/trouble',
    ]);
  });

  it('accepts a proposal that grounds every field in the rolls it was given', () => {
    expect(checkSettlementProposal(valid, rolled)).toBeUndefined();
  });

  it('refuses a field that cites no roll, or one it was not given', () => {
    const value = {
      ...valid,
      authority: { ...valid.authority, groundedIn: [] },
      population: { ...valid.population, groundedIn: ['family-name'] },
    };
    const problems = checkSettlementProposal(value, rolled);
    expect(problems).toMatch(/authority cites no oracle roll/);
    expect(problems).toMatch(/population cites "family-name"/);
  });

  it('refuses a location the dice did not give (§4)', () => {
    const value = { ...valid, location: { ...valid.location, value: 'deep_space' as const } };
    expect(checkSettlementProposal(value, rolled)).toMatch(/rolled as orbital/);
  });

  it('refuses a planet class the dice did not give (§4)', () => {
    const value = {
      ...valid,
      planet: {
        ...valid.planet!,
        planetClass: { ...valid.planet!.planetClass, value: 'jungle' as const },
      },
    };
    expect(checkSettlementProposal(value, rolled)).toMatch(/class was rolled as ice/);
  });
});
