import { describe, expect, it } from 'vitest';

import type {
  LaunchProblem,
  LaunchReadiness,
  LaunchSection,
  LaunchSectionStatus,
} from '@astrolabe/rules';

import { buildReview, groupProblemsBySection } from './review.js';
import { emptyCampaignState, NAMED_CAMPAIGN } from './state-fixture.js';
import { LAUNCH_SECTION_ORDER } from './sections.js';

const problem = (section: LaunchSection, code: string): LaunchProblem => ({
  section,
  code,
  path: `${section}.field`,
  message: `${section}: ${code}`,
});

function readiness(problems: readonly LaunchProblem[]): LaunchReadiness {
  const sections = {} as Record<
    LaunchSection,
    { status: LaunchSectionStatus; blockers: readonly LaunchProblem[] }
  >;
  for (const section of LAUNCH_SECTION_ORDER) {
    const blockers = problems.filter((problem) => problem.section === section);
    sections[section] = { status: blockers.length === 0 ? 'complete' : 'in_progress', blockers };
  }
  return { ready: problems.length === 0, problems, sections };
}

const workspace = (problems: readonly LaunchProblem[]) => ({
  state: { ...emptyCampaignState(), ...NAMED_CAMPAIGN },
  readiness: readiness(problems),
});

describe('the launch review', () => {
  it('groups blockers by section, in the order the workspace lists them', () => {
    // Incident first in the input, to prove the grouping imposes its own order
    // rather than following whatever order the problems arrived in.
    const problems = [
      problem('incident_launch', 'incident_missing'),
      problem('truths', 'truth_missing'),
      problem('truths', 'truth_subchoice_missing'),
    ];

    const groups = groupProblemsBySection('c1', readiness(problems));

    expect(groups.map((group) => group.section)).toEqual(['truths', 'incident_launch']);
    expect(groups[0]).toMatchObject({ label: 'Truths', href: '/campaigns/c1/launch/truths' });
    expect(groups[0]!.problems).toHaveLength(2);
  });

  it('drops the sections with nothing wrong', () => {
    const groups = groupProblemsBySection('c1', readiness([problem('crew', 'crew_count_invalid')]));

    expect(groups).toHaveLength(1);
  });

  it('disables Launch while anything blocks, and counts every problem', () => {
    const review = buildReview(
      'c1',
      workspace([problem('crew', 'crew_count_invalid'), problem('sector', 'sector_missing')]),
    );

    expect(review).toMatchObject({ ready: false, launchEnabled: false, problemCount: 2 });
    expect(review.groups).toHaveLength(2);
  });

  it('takes Launch enablement from the server, never from the blocker list', () => {
    // D-176 at the one place it decides something irreversible. A readiness
    // that says no with nothing listed still says no.
    const stubborn = { ...readiness([]), ready: false };

    expect(buildReview('c1', { state: emptyCampaignState(), readiness: stubborn })).toMatchObject({
      launchEnabled: false,
      groups: [],
    });
  });

  it('enables Launch and lists nothing once the campaign is ready', () => {
    const review = buildReview('c1', workspace([]));

    expect(review).toMatchObject({ ready: true, launchEnabled: true, problemCount: 0 });
    expect(review.groups).toEqual([]);
  });

  it('summarises what is accepted, and says plainly what is not', () => {
    const review = buildReview('c1', workspace([problem('incident_launch', 'incident_missing')]));

    expect(review.summary).toMatchObject({
      campaignName: 'Lantern Wake',
      premise: null,
      truthsDecided: 0,
      crew: [],
      starshipName: null,
      startingSettlementName: null,
      sectorTrouble: null,
      connection: null,
      // Group 9 accepts the incident; until then the review says so rather
      // than inventing a roller or a scene.
      incident: null,
    });
  });

  it('names who shares the vow besides its roller (9.3)', () => {
    const vesna = 'aaaa6666-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const rook = 'aaaa7777-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const base = emptyCampaignState({
      incident: {
        text: 'Answer the beacon',
        rank: 'formidable',
        rollerId: vesna,
        participants: [vesna, rook],
        openingScene: { title: 'The dock' },
      } as never,
    });
    const state = {
      ...base,
      ...NAMED_CAMPAIGN,
      characters: { [vesna]: { name: 'Vesna Kade' }, [rook]: { name: 'Rook Ilari' } } as never,
    };

    const { summary } = buildReview('c1', { state, readiness: readiness([]) });

    expect(summary.incident).toMatchObject({
      rollerName: 'Vesna Kade',
      participantNames: ['Rook Ilari'],
    });
  });
});
