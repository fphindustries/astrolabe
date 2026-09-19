import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';

import { REGION_BASELINES, validateLaunchReadiness, type LaunchReadinessInput } from './rules.js';

/**
 * Readiness reaching `ready` is the gate every other Campaign Launch promise
 * hangs off: activation revalidates through this function, so a validator that
 * can only ever say no makes A38 unreachable. It shipped that way once, because
 * every existing test asserted a *blocker* and none asserted the absence of all
 * of them.
 */

const paths = STARFORGED.assets
  .filter((asset) => asset.categoryId === 'path')
  .slice(0, 3)
  .map((asset) => asset.id);
const starshipAsset =
  STARFORGED.assets.find((asset) => asset.categoryId === 'command_vehicle')?.id ??
  ('asset:command-vehicle/starship' as never);

const VESNA = 'vesna';

/** Every truth answered the cheapest legal way: explicitly left open (D-162). */
const allTruthsLeftOpen = STARFORGED.truths.map((truth) => ({
  truthId: truth.id,
  kind: 'leave_open' as const,
}));

/** A complete Expanse launch: the smallest baseline, 2 settlements and 1 passage. */
function readyInput(): LaunchReadinessInput {
  return {
    campaignName: 'Lantern Wake',
    premise: 'A crew chasing a signal out past the Drift.',
    draftedSections: [],
    truths: allTruthsLeftOpen,
    characters: [
      {
        id: VESNA,
        draft: {
          name: 'Vesna Kade',
          callsign: 'Map',
          stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
          assets: paths,
          appearance: 'Weathered flight jacket',
          backstory: { kind: 'discover_in_play' },
          backgroundVow: { title: 'Find the lost colony', rank: 'formidable' },
        },
      },
    ],
    starship: {
      name: 'Lantern Wake',
      appearance: 'Old freighter',
      history: 'Won in a wager',
      quirks: ['Slow clocks'],
      integrity: { value: 5, min: 0, max: 5 },
      assetId: starshipAsset,
    },
    sector: {
      region: 'expanse',
      settlements: [
        {
          id: 'ember-hold',
          name: 'Ember Hold',
          location: 'deep_space',
          population: 'Hundreds',
          authority: 'Corporate',
          projects: ['Rebuilding the relay'],
          firstLooks: ['Cold corridors'],
          trouble: 'The dock crews have not been paid.',
        },
        {
          id: 'still-harbor',
          name: 'Still Harbor',
          location: 'deep_space',
          population: 'Dozens',
          authority: 'Ineffectual',
          projects: ['Salvage'],
        },
      ],
      locations: [],
      planets: [],
      routes: [{ from: 'ember-hold', to: 'still-harbor' }],
      startingSettlementId: 'ember-hold',
      sectorTrouble: 'The relay grid is failing.',
    },
    connection: {
      npcName: 'Juno Marr',
      role: 'Dockmaster',
      rank: 'dangerous',
      participants: [VESNA],
    },
    incident: {
      text: 'A distress beacon from the lost colony.',
      rank: 'formidable',
      rollerId: VESNA,
      participants: [VESNA],
      openingScene: 'The dock at Ember Hold',
    },
  };
}

const check = (input: LaunchReadinessInput) =>
  validateLaunchReadiness(input, STARFORGED.truths, STARFORGED);

describe('launch readiness can be satisfied', () => {
  it('reports ready with no problems for a complete launch', () => {
    const readiness = check(readyInput());

    expect(readiness.problems).toEqual([]);
    expect(readiness.ready).toBe(true);
    for (const section of Object.values(readiness.sections))
      expect(section.status).toBe('complete');
  });

  it('enforces each region baseline as a hard gate (A31, D-174, D-179)', () => {
    // Verified against the rulebook (D-179) and absent from Datasworn, so they
    // are pinned here rather than only cited. Enforcing them is Astrolabe's
    // own stricter-than-the-rules choice, made deliberately (D-180).
    expect(REGION_BASELINES.terminus).toMatchObject({ settlements: 4, passages: 3 });
    expect(REGION_BASELINES.outlands).toMatchObject({ settlements: 3, passages: 2 });
    expect(REGION_BASELINES.expanse).toMatchObject({ settlements: 2, passages: 1 });

    // Each carries the citation it is traced to (task 1.2). That is all a test
    // can check here: pp. 116-120 are outside the CC-BY subset, so the numbers
    // themselves are not in Datasworn and D-179 leaves them to the user.
    for (const baseline of Object.values(REGION_BASELINES))
      expect(baseline.citation).toMatch(/Rulebook/);

    // The ready sector satisfies Expanse exactly; it is short for the others.
    const ready = readyInput();
    for (const region of ['terminus', 'outlands'] as const) {
      const codes = check({
        ...ready,
        sector: { ...ready.sector!, region },
      }).problems.map((problem) => problem.code);
      expect(codes).toContain('settlements_insufficient');
      expect(codes).toContain('passages_insufficient');
    }
    // 10.4: named as the rulebook names it, and counted in English.
    const outlands = check({ ...ready, sector: { ...ready.sector!, region: 'outlands' } });
    expect(outlands.problems.map((problem) => problem.message)).toEqual(
      expect.arrayContaining([
        'The Outlands needs at least 3 settlements.',
        'The Outlands needs at least 2 passages.',
      ]),
    );
  });

  it('permits content beyond the baseline (A31)', () => {
    const ready = readyInput();
    const extra = {
      ...ready,
      sector: {
        ...ready.sector!,
        settlements: [
          ...ready.sector!.settlements,
          {
            id: 'far-watch',
            name: 'Far Watch',
            location: 'deep_space' as const,
            population: 'A few',
            authority: 'None',
            projects: ['Listening'],
          },
        ],
        routes: [
          ...ready.sector!.routes,
          { from: 'still-harbor', to: 'far-watch' },
          { from: 'far-watch', to: { kind: 'off_map' as const, label: 'The Drift' } },
        ],
      },
    };

    expect(check(extra).ready).toBe(true);
  });

  it('rejects a self-linked, duplicated, or unknown passage (D-174)', () => {
    const ready = readyInput();
    const codesFor = (routes: NonNullable<LaunchReadinessInput['sector']>['routes']) =>
      check({ ...ready, sector: { ...ready.sector!, routes } }).problems.map((p) => p.code);

    expect(codesFor([{ from: 'ember-hold', to: 'ember-hold' }])).toContain('route_self_link');
    expect(
      codesFor([
        { from: 'ember-hold', to: 'still-harbor' },
        // Undirected: the same passage stated the other way round.
        { from: 'still-harbor', to: 'ember-hold' },
      ]),
    ).toContain('route_duplicate');
    expect(codesFor([{ from: 'ember-hold', to: 'nowhere' }])).toContain('route_endpoint_unknown');
  });

  it('requires one to six characters (A27)', () => {
    const ready = readyInput();
    const crewOf = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...ready.characters[0]!,
        id: `crew-${index}`,
      }));

    expect(check({ ...ready, characters: [] }).problems.map((p) => p.code)).toContain(
      'crew_count_invalid',
    );
    expect(
      check({
        ...ready,
        characters: crewOf(7),
        connection: { ...ready.connection!, participants: ['crew-0'] },
        incident: { ...ready.incident!, rollerId: 'crew-0', participants: ['crew-0'] },
      }).problems.map((p) => p.code),
    ).toContain('crew_count_invalid');
    expect(
      check({
        ...ready,
        characters: crewOf(6),
        connection: { ...ready.connection!, participants: ['crew-0'] },
        incident: { ...ready.incident!, rollerId: 'crew-0', participants: ['crew-0'] },
      }).ready,
    ).toBe(true);
  });

  it('waits for the vow’s choices, which beat 11 leaves to the review page (D-200)', () => {
    const { rollerId: _roller, participants: _crew, ...words } = readyInput().incident!;

    const readiness = check({ ...readyInput(), incident: words });

    expect(readiness.ready).toBe(false);
    expect(readiness.problems.map((p) => p.code)).toEqual(['incident_vow_choices_missing']);
    expect(readiness.sections.incident_launch.blockers.map((p) => p.path)).toEqual([
      'incident.vow',
    ]);
  });

  it('blocks on a missing premise but not on the campaign settings (D-181)', () => {
    const ready = readyInput();
    const { premise: _dropped, ...withoutPremise } = ready;

    const foundation = check(withoutPremise).sections.foundation;

    // The named campaign is what makes the section started, so the player sees
    // a section in progress with a stated reason rather than an untouched one.
    expect(foundation.status).toBe('in_progress');
    expect(foundation.blockers.map((problem) => problem.code)).toEqual(['premise_required']);

    // Blank is the same as absent: the command refuses both, and readiness must
    // agree with the command it fronts.
    expect(check({ ...ready, premise: '   ' }).problems.map((problem) => problem.code)).toContain(
      'premise_required',
    );

    // The bound D-181 draws: settings always have defaults, so they never block.
    // `readyInput` carries no settings at all and still reaches ready.
    expect(check(ready).ready).toBe(true);
  });

  it('treats an unanswered truth as a blocker and an open one as decided (D-162)', () => {
    const ready = readyInput();

    expect(check({ ...ready, truths: [] }).problems.map((p) => p.code)).toContain('truth_missing');
    expect(check(ready).ready).toBe(true);
  });

  it('requires the starting settlement to have first looks and its own trouble (A35)', () => {
    const ready = readyInput();
    const [start, ...rest] = ready.sector!.settlements;
    const { trouble: _dropped, ...withoutTrouble } = start!;

    const codes = check({
      ...ready,
      sector: { ...ready.sector!, settlements: [withoutTrouble, ...rest] },
    }).problems.map((p) => p.code);

    expect(codes).toContain('starting_settlement_detail_missing');
  });

  it('requires the starting settlement’s planet to carry the deeper detail (A33)', () => {
    const ready = readyInput();
    const [start, ...rest] = ready.sector!.settlements;

    const codes = check({
      ...ready,
      sector: {
        ...ready.sector!,
        settlements: [{ ...start!, location: 'planetside', planetId: 'ember' }, ...rest],
        planets: [{ id: 'ember', name: 'Ember', class: 'Furnace', atmosphere: 'Toxic' }],
      },
    }).problems.map((p) => p.code);

    expect(codes).toContain('starting_planet_detail_missing');
  });
});

describe('a saved draft starts a section (6.0f, D-187)', () => {
  const empty = (): LaunchReadinessInput => ({
    campaignName: '',
    draftedSections: [],
    truths: [],
    characters: [],
  });
  const check = (input: LaunchReadinessInput) =>
    validateLaunchReadiness(input, STARFORGED.truths, STARFORGED);

  it('reads a section with nothing in it as not started', () => {
    const sections = check(empty()).sections;

    expect(sections.crew.status).toBe('not_started');
    expect(sections.starship.status).toBe('not_started');
  });

  it('reads a section with a saved draft as in progress', () => {
    // Crew is the case this exists for. A truth is accepted the moment it is
    // decided, but a character sits in a draft for its entire build — so a
    // player who saved a half-built Rook and reopened the workspace read
    // "Crew — Not started" beside their own saved work.
    const sections = check({ ...empty(), draftedSections: ['crew'] }).sections;

    expect(sections.crew.status).toBe('in_progress');
    // Only the section that has one.
    expect(sections.starship.status).toBe('not_started');
  });

  it('does not let a draft complete a section', () => {
    // The bound. D-161 makes a draft durable and not canon, so it clears no
    // blocker; only an accepted fact does. A draft that could complete a
    // section would let an unaccepted form pass readiness.
    const drafted = check({ ...empty(), draftedSections: ['crew', 'starship'] });

    expect(drafted.ready).toBe(false);
    expect(drafted.sections.crew.blockers.map((blocker) => blocker.code)).toContain(
      'crew_count_invalid',
    );
  });

  it('leaves a section its accepted facts already started alone', () => {
    const accepted = check({ ...readyInput(), draftedSections: [] });

    expect(accepted.sections.crew.status).toBe('complete');
  });
});
