import { describe, expect, it } from 'vitest';

import type { AstrolabeEvent, EntityId } from '@astrolabe/shared';
import { testEvent } from '@astrolabe/shared/test-fixtures';

import { buildLaunchWorkspace } from './workspace.js';

/**
 * The rules-aware read layer (D-176). These tests guard the seam that broke
 * once already: trouble facts were projected and then read by nobody, so
 * `sector_trouble_missing` was permanent, readiness could never reach `ready`,
 * and the activation command always refused. The seam is untyped by nature —
 * it maps projected payloads onto the rules' own draft shapes — so each fact
 * the validator needs gets an explicit test that it arrives.
 */

const SECTOR = 'aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const STAR = 'aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const SETTLEMENT = 'aaaa4444-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const SECTOR_TROUBLE = 'aaaa5555-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const SETTLEMENT_TROUBLE = 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;

const acceptance = { provenance: 'player_written', groundedIn: [] } as const;

/** A sector far enough along to reach the trouble and starting-settlement checks. */
function sectorEvents(): AstrolabeEvent[] {
  let seq = 0;
  const next = () => ({ seq: (seq += 1) });
  return [
    testEvent(
      'sector.configured',
      {
        sectorId: SECTOR,
        name: 'Lantern Reach',
        region: 'expanse',
        baseline: { settlements: 2, passages: 1 },
        starId: STAR,
        ...acceptance,
      },
      next(),
    ),
    testEvent(
      'location.added',
      {
        kind: 'settlement',
        id: SETTLEMENT,
        name: 'Ember Hold',
        location: 'deep_space',
        population: 'Hundreds',
        authority: 'Corporate',
        projects: ['Rebuilding the relay'],
        firstLooks: ['Cold corridors'],
        ...acceptance,
      },
      next(),
    ),
    testEvent('starting_settlement.selected', { settlementId: SETTLEMENT }, next()),
  ];
}

describe('the launch workspace read layer', () => {
  it('feeds an accepted sector trouble to readiness', () => {
    const events = [
      ...sectorEvents(),
      testEvent(
        'trouble.established',
        {
          troubleId: SECTOR_TROUBLE,
          kind: 'sector',
          text: 'The relay grid is failing.',
          ...acceptance,
        },
        { seq: 10 },
      ),
    ];

    const workspace = buildLaunchWorkspace(events);

    expect(Object.keys(workspace.state.launch.troubles)).toHaveLength(1);
    expect(codes(workspace)).not.toContain('sector_trouble_missing');
  });

  it('feeds an accepted settlement trouble to its own settlement', () => {
    const events = [
      ...sectorEvents(),
      testEvent(
        'trouble.established',
        {
          troubleId: SETTLEMENT_TROUBLE,
          kind: 'settlement',
          ownerId: SETTLEMENT,
          text: 'The dock crews have not been paid.',
          ...acceptance,
        },
        { seq: 10 },
      ),
    ];

    expect(codes(buildLaunchWorkspace(events))).not.toContain('starting_settlement_detail_missing');
  });

  it('still blocks when the starting settlement has no trouble of its own', () => {
    // A sector trouble is not a settlement trouble: A35 wants both.
    const events = [
      ...sectorEvents(),
      testEvent(
        'trouble.established',
        {
          troubleId: SECTOR_TROUBLE,
          kind: 'sector',
          text: 'The relay grid is failing.',
          ...acceptance,
        },
        { seq: 10 },
      ),
    ];

    expect(codes(buildLaunchWorkspace(events))).toContain('starting_settlement_detail_missing');
  });

  // A star is optional (A33), so readiness has nothing to assert about it. The
  // mapping exists for the read model; 8.3 covers it once the UI reads it.
});

function codes(workspace: ReturnType<typeof buildLaunchWorkspace>): string[] {
  return workspace.readiness.problems.map((problem) => problem.code);
}
