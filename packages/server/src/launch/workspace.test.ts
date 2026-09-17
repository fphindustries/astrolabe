import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CAMPAIGN_SETTINGS,
  type AstrolabeEvent,
  type EntityId,
  type SceneId,
  type SessionId,
} from '@astrolabe/shared';
import { testEvent, testEventId } from '@astrolabe/shared/test-fixtures';

import type { CharacterId, OracleId } from '@astrolabe/rules';

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
const SESSION = 'aaaa7777-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as SessionId;
const SCENE = 'aaaa8888-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as SceneId;
const INCIDENT = 'aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as EntityId;
const VESNA = 'aaaabbbb-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as CharacterId;

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
  it('resolves the oracle rolls a decided truth cites (A41)', () => {
    // The gap this closes: a rolled truth records `groundedIn` as event ids,
    // and nothing else in the payload says which table came up with what. A
    // truth is not an entity, so `/entities/:entityId/grounding` cannot answer
    // for it, and the chip beat 2 asks for had no source.
    const rollId = testEventId(4);
    const events: AstrolabeEvent[] = [
      testEvent(
        'oracle.rolled',
        { oracleId: 'oracle:truth/cataclysm', roll: 42, rowText: 'A slow unmaking.' },
        { seq: 4 },
      ),
      testEvent(
        'truth.decided',
        {
          truthId: 'oracle:truth/cataclysm' as OracleId,
          resolution: 'rolled',
          optionIndex: 1,
          text: 'A slow unmaking of everything that held.',
          provenance: 'oracle_roll',
          groundedIn: [rollId],
        },
        { seq: 5 },
      ),
    ];

    const workspace = buildLaunchWorkspace(events);

    expect(workspace.chips[rollId]).toMatchObject({
      oracleId: 'oracle:truth/cataclysm',
      roll: 42,
      rowText: 'A slow unmaking.',
      voided: false,
    });
  });

  it('carries no chip for a truth chosen rather than rolled', () => {
    // Over-collecting citations is safe, but an empty `groundedIn` must not
    // conjure a chip: "chosen" and "rolled" are different provenance, and A41
    // shows a chip only for the roll that actually happened.
    const workspace = buildLaunchWorkspace([
      testEvent(
        'truth.decided',
        {
          truthId: 'oracle:truth/cataclysm' as OracleId,
          resolution: 'selected',
          optionIndex: 0,
          text: 'It was a war.',
          ...acceptance,
        },
        { seq: 1 },
      ),
    ]);

    expect(workspace.chips).toEqual({});
  });

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

  it('reports whether launch is open, exactly as a launch command would (D-178)', () => {
    const created = testEvent(
      'campaign.created',
      { name: 'Lantern Wake', settings: DEFAULT_CAMPAIGN_SETTINGS },
      { seq: 1 },
    );

    expect(buildLaunchWorkspace([created])).toMatchObject({ launchOpen: true });
    expect(buildLaunchWorkspace([created]).closedReason).toBeUndefined();

    // The case a phase-only guard misses, and the one A43 turns on: every
    // Milestone 1 campaign has sessions and no `campaign.activated`, so its
    // phase still reads `draft` while it is plainly in play.
    const inPlay = buildLaunchWorkspace([
      created,
      testEvent('session.began', { sessionId: SESSION, number: 1 }, { seq: 2 }),
    ]);
    expect(inPlay.state.launch.phase).toBe('draft');
    expect(inPlay).toMatchObject({ launchOpen: false, closedReason: 'campaign_in_play' });

    const activated = buildLaunchWorkspace([
      created,
      testEvent(
        'campaign.activated',
        {
          sessionId: SESSION,
          sceneId: SCENE,
          readinessVersion: 1,
          launchFactEventIds: [],
          pendingVow: {
            incidentId: INCIDENT,
            rank: 'formidable',
            rollerId: VESNA,
            participants: [VESNA],
          },
        },
        { seq: 2 },
      ),
    ]);
    expect(activated).toMatchObject({ launchOpen: false, closedReason: 'campaign_active' });
  });

  it('carries the accepted premise across, and only the accepted one (D-181, D-161)', () => {
    const created = testEvent(
      'campaign.created',
      { name: 'Lantern Wake', settings: DEFAULT_CAMPAIGN_SETTINGS },
      { seq: 1 },
    );

    // A named campaign with nothing else: foundation is in progress, and the
    // premise is what it is waiting for.
    const bare = buildLaunchWorkspace([created]);
    expect(bare.readiness.sections.foundation.status).toBe('in_progress');
    expect(bare.readiness.sections.foundation.blockers.map((problem) => problem.code)).toEqual([
      'premise_required',
    ]);

    // A premise sitting in a saved draft is not canon (D-161), so it does not
    // clear the blocker. This is the half a `?? draft` read would get wrong.
    const drafted = buildLaunchWorkspace([
      created,
      testEvent(
        'launch.draft_saved',
        { section: 'foundation', snapshot: { premise: 'Drafted, not accepted.' } },
        { seq: 2 },
      ),
    ]);
    expect(codes(drafted)).toContain('premise_required');

    // Accepting it does.
    const accepted = buildLaunchWorkspace([
      created,
      testEvent(
        'campaign.foundation_set',
        {
          premise: 'A crew chasing a signal out past the Drift.',
          settings: DEFAULT_CAMPAIGN_SETTINGS,
          ...acceptance,
        },
        { seq: 3 },
      ),
    ]);
    expect(codes(accepted)).not.toContain('premise_required');
    expect(accepted.readiness.sections.foundation.status).toBe('complete');
  });
});

function codes(workspace: ReturnType<typeof buildLaunchWorkspace>): string[] {
  return workspace.readiness.problems.map((problem) => problem.code);
}
