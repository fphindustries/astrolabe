import { describe, expect, it } from 'vitest';

import { STARFORGED } from '@astrolabe/rules';

import { LogBuilder } from '../../projection/fixtures.js';
import { project } from '../../projection/project.js';

import { incidentContext, renderSetup } from './incident.js';

/**
 * Task 3R.6: incident proposals read the *complete* accepted launch context
 * D-168 lists — truths and their quest starters, crew backgrounds and
 * background vows, the starship, sector and settlement trouble, and the local
 * connection.
 *
 * Task 3.7 was marked done while the context supplied truths and bare
 * location names only, so every assertion here names the fact it is checking
 * arrives rather than testing the renderer in general.
 */

const acceptance = { provenance: 'player_written', groundedIn: [] } as const;

const SECTOR = 'aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMBER = 'aaaa4444-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HARBOR = 'aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SHIP = 'aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECTOR_TROUBLE = 'aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SETTLEMENT_TROUBLE = 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONNECTION = 'aaaabbbb-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NPC = 'aaaacccc-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRACK = 'aaaadddd-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VESNA = '44444444-4444-4444-8444-444444444444';

const TRUTH = STARFORGED.truths[0]!;
const OPEN_TRUTH = STARFORGED.truths[1]!;

function launched() {
  const paths = STARFORGED.assets
    .filter((asset) => asset.categoryId === 'path')
    .slice(0, 3)
    .map((asset) => asset.id);

  return project(
    new LogBuilder()
      .add('campaign.created', {
        name: 'Lantern Wake',
        settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
      })
      .add('truth.decided', {
        truthId: TRUTH.id,
        resolution: 'custom',
        text: 'The Forge swallowed the first fleet.',
        questStarter: 'Find what the first fleet left behind.',
        ...acceptance,
      })
      .add('truth.decided', { truthId: OPEN_TRUTH.id, resolution: 'leave_open', ...acceptance })
      .add('launch.draft_saved', {
        section: 'foundation',
        snapshot: { premise: 'A premise nobody accepted.' },
      })
      .add('character.created', {
        characterId: VESNA as never,
        name: 'Vesna Kade',
        callsign: 'Map',
        stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        meters: {
          health: { value: 5, min: 0, max: 5 },
          spirit: { value: 5, min: 0, max: 5 },
          supply: { value: 5, min: 0, max: 5 },
        },
        momentum: 2,
        assets: paths,
        appearance: 'Weathered flight jacket',
        backstory: { kind: 'written', text: 'Grew up on a relay station that went dark.' },
        backgroundVow: { title: 'Find the lost colony', rank: 'formidable' },
      })
      .add('starship.established', {
        starshipId: SHIP as never,
        name: 'Lantern Wake',
        appearance: 'Old freighter, patched hull',
        history: 'Won in a wager',
        quirks: ['The clocks run slow'],
        integrity: { value: 5, min: 0, max: 5 },
        assetId: 'asset:command-vehicle/starship' as never,
        modules: [],
        ...acceptance,
      })
      .add('sector.configured', {
        sectorId: SECTOR as never,
        name: 'Lantern Reach',
        region: 'expanse',
        baseline: { settlements: 2, passages: 1 },
        ...acceptance,
      })
      .add('location.added', {
        kind: 'settlement',
        id: EMBER as never,
        name: 'Ember Hold',
        location: 'deep_space',
        population: 'Hundreds',
        authority: 'Corporate',
        projects: ['Rebuilding the relay'],
        firstLooks: ['Cold corridors, warm voices'],
        ...acceptance,
      })
      .add('location.added', {
        kind: 'settlement',
        id: HARBOR as never,
        name: 'Still Harbor',
        location: 'deep_space',
        population: 'Dozens',
        authority: 'Ineffectual',
        projects: ['Salvage rights'],
        ...acceptance,
      })
      .add('route.added', { from: EMBER as never, to: HARBOR as never, ...acceptance })
      .add('starting_settlement.selected', { settlementId: EMBER as never })
      .add('trouble.established', {
        kind: 'sector',
        troubleId: SECTOR_TROUBLE as never,
        text: 'The relay grid is failing, one node at a time.',
        ...acceptance,
      })
      .add('trouble.established', {
        kind: 'settlement',
        troubleId: SETTLEMENT_TROUBLE as never,
        ownerId: EMBER as never,
        text: 'The dock crews have not been paid.',
        ...acceptance,
      })
      .add('entity.established', {
        entityId: NPC as never,
        kind: 'npc',
        name: 'Juno Marr',
        fields: {
          role: 'Dockmaster',
          goal: 'Keep the docks open',
          firstLook: 'Oil-stained gloves',
          disposition: 'Wary',
        },
        provenance: { establishedBy: 'player', groundedIn: [] },
      })
      .add('connection.established', {
        connectionId: CONNECTION as never,
        npcId: NPC as never,
        npcName: 'Juno Marr',
        role: 'Dockmaster',
        rank: 'dangerous',
        trackId: TRACK as never,
        participants: [VESNA as never],
        automaticStrongHit: true,
        ...acceptance,
      })
      .build(),
  );
}

describe('incident context carries the complete accepted launch facts (D-168)', () => {
  const setup = renderSetup(launched());

  it('carries the accepted truth and labels its quest starter as inspiration (A25)', () => {
    expect(setup).toContain('The Forge swallowed the first fleet.');
    expect(setup).toContain('quest starter (inspiration only): Find what the first fleet left');
  });

  it('says an open truth is open rather than leaving it blank (D-162)', () => {
    expect(setup).toContain('deliberately left open');
  });

  it("carries the crew's appearance, background vow and written backstory (D-163)", () => {
    expect(setup).toContain('appearance: Weathered flight jacket');
    expect(setup).toContain('background vow: "Find the lost colony" (formidable)');
    expect(setup).toContain('backstory: Grew up on a relay station that went dark.');
  });

  it('carries settlement detail and the passage between them, not just names', () => {
    expect(setup).toContain('population: Hundreds');
    expect(setup).toContain('authority: Corporate');
    expect(setup).toContain('first looks: Cold corridors, warm voices');
    expect(setup).toContain('routes to Still Harbor');
    expect(setup).toContain('[starting settlement]');
  });

  it("carries the sector's own name and region (8.0j)", () => {
    expect(setup).toContain('The starting sector: Lantern Reach, in the expanse.');
  });

  it('carries the shared starship', () => {
    expect(setup).toContain('The starship: Lantern Wake');
    expect(setup).toContain('quirks: The clocks run slow');
  });

  it('carries both troubles, each against what it troubles', () => {
    expect(setup).toContain('Trouble in the sector: The relay grid is failing');
    expect(setup).toContain('Trouble in Ember Hold: The dock crews have not been paid.');
  });

  it('carries the local connection and who shares it', () => {
    expect(setup).toContain('The local connection: Juno Marr, Dockmaster (dangerous)');
    expect(setup).toContain('shared with Map');
  });

  // 9.2: what the NPC recipe gave the person, which the context gained after 3R.6.
  it('carries the connection’s person: goal, first look and disposition', () => {
    expect(setup).toContain(
      'goal: Keep the docks open; first look: Oil-stained gloves; disposition: Wary',
    );
  });

  it('never carries an unaccepted draft (D-161)', () => {
    expect(setup).not.toContain('A premise nobody accepted');
  });

  it('offers every launch fact as something an option may cite (A37)', () => {
    const keys = [...incidentContext(launched()).launchFacts.keys()];

    expect(keys).toEqual([
      'Starship: Lantern Wake',
      'Trouble in the sector',
      'Trouble in Ember Hold',
      'Connection: Juno Marr',
    ]);
  });
});

describe('an empty launch still says so', () => {
  const setup = renderSetup(
    project(
      new LogBuilder()
        .add('campaign.created', {
          name: 'Bare',
          settings: { narrationLatitude: 'color', narrationLength: 'standard', rerollCap: 2 },
        })
        .build(),
    ),
  );

  it('names each missing part rather than staying silent (D-133)', () => {
    expect(setup).toContain('The starship: not established yet.');
    expect(setup).toContain('Troubles: none established yet.');
    expect(setup).toContain('The local connection: not established yet.');
  });
});
