import { describe, expect, it } from 'vitest';

import type {
  LaunchProblem,
  LaunchReadiness,
  LaunchSection,
  LaunchSectionStatus,
} from '@astrolabe/rules';

import { buildDashboard, STATUS_TEXT } from './dashboard.js';
import { LAUNCH_SECTION_ORDER } from './sections.js';

/**
 * The guard these tests exist for is narrow and specific: the dashboard reports
 * what the server said and never recalculates it. Group 3R was created because
 * a second copy of readiness logic drifted from the first; this is where that
 * would reappear on the client.
 */

const problem = (section: LaunchSection, code: string): LaunchProblem => ({
  section,
  code,
  path: `${section}.field`,
  message: `${section} needs something.`,
});

/** A readiness payload with every section at one status and no blockers. */
function readiness(
  overrides: Partial<
    Record<LaunchSection, { status: LaunchSectionStatus; blockers: readonly LaunchProblem[] }>
  > = {},
): LaunchReadiness {
  const sections = Object.fromEntries(
    LAUNCH_SECTION_ORDER.map((section) => [
      section,
      overrides[section] ?? { status: 'not_started' as const, blockers: [] },
    ]),
  ) as LaunchReadiness['sections'];
  const problems = LAUNCH_SECTION_ORDER.flatMap((section) => sections[section].blockers);
  return { ready: problems.length === 0, problems, sections };
}

describe('the launch dashboard view model', () => {
  it('renders one card per section, in D-160’s order', () => {
    const { cards } = buildDashboard('c1', readiness());

    expect(cards.map((card) => card.section)).toEqual(LAUNCH_SECTION_ORDER);
    expect(cards[0]).toMatchObject({
      label: 'Foundation',
      href: '/campaigns/c1/launch/foundation',
      statusText: 'Not started',
      implemented: true,
      arrivesIn: null,
    });
  });

  it('copies the server’s status and blockers across untouched', () => {
    const blockers = [
      problem('truths', 'truth_missing'),
      problem('truths', 'truth_subchoice_missing'),
    ];
    const { cards } = buildDashboard(
      'c1',
      readiness({ truths: { status: 'in_progress', blockers } }),
    );
    const truths = cards.find((card) => card.section === 'truths')!;

    expect(truths.status).toBe('in_progress');
    // Same array contents, same order: the screen does not sort or filter them.
    expect(truths.blockers).toEqual(blockers);
  });

  it('never recomputes a status from its blockers, in either direction', () => {
    // Both halves of D-176. A section the server calls complete stays complete
    // even carrying a stray blocker, and one it calls incomplete stays so even
    // with none — because the client is not the authority on either.
    const odd = buildDashboard(
      'c1',
      readiness({
        crew: { status: 'complete', blockers: [problem('crew', 'crew_count_invalid')] },
        sector: { status: 'in_progress', blockers: [] },
      }),
    );

    expect(odd.cards.find((card) => card.section === 'crew')!.statusText).toBe('Complete');
    expect(odd.cards.find((card) => card.section === 'sector')!.statusText).toBe('In progress');
  });

  it('marks a section complete even when its editor is still ahead', () => {
    // Someone drove the API directly, or a legacy campaign already carries the
    // facts. A placeholder reports the truth about the campaign, not about
    // whether group 4 built its form.
    // Sector is the example now that Starship has its editor; it moves again
    // when group 8 lands.
    const { cards } = buildDashboard(
      'c1',
      readiness({ sector: { status: 'complete', blockers: [] } }),
    );
    const sector = cards.find((card) => card.section === 'sector')!;

    expect(sector).toMatchObject({ statusText: 'Complete', implemented: false });
    expect(sector.arrivesIn).toBe('Starting Sector (group 8)');
  });

  it('points at the first unfinished section, and says start or continue', () => {
    expect(buildDashboard('c1', readiness()).nextAction).toEqual({
      kind: 'section',
      section: 'foundation',
      label: 'Start Foundation',
      href: '/campaigns/c1/launch/foundation',
    });

    expect(
      buildDashboard('c1', readiness({ foundation: { status: 'in_progress', blockers: [] } }))
        .nextAction,
    ).toMatchObject({ label: 'Continue Foundation' });

    // Foundation done: the next useful thing is Truths, whose editor arrives in
    // group 5. Pointing at it anyway is deliberate.
    expect(
      buildDashboard('c1', readiness({ foundation: { status: 'complete', blockers: [] } }))
        .nextAction,
    ).toMatchObject({ section: 'truths', label: 'Start Truths' });
  });

  it('offers the review once every section is complete', () => {
    const all = Object.fromEntries(
      LAUNCH_SECTION_ORDER.map((section) => [
        section,
        { status: 'complete' as const, blockers: [] },
      ]),
    );
    const dashboard = buildDashboard('c1', readiness(all));

    expect(dashboard.nextAction).toEqual({
      kind: 'review',
      label: 'Review and launch',
      href: '/campaigns/c1/launch/review',
    });
    expect(dashboard).toMatchObject({ ready: true, problemCount: 0 });
  });

  it('gives every status distinct words, so meaning never rides on colour', () => {
    const words = Object.values(STATUS_TEXT);

    expect(new Set(words).size).toBe(words.length);
    for (const word of words) expect(word.trim()).not.toBe('');
  });
});
