import type {
  LaunchProblem,
  LaunchReadiness,
  LaunchSection,
  LaunchSectionStatus,
} from '@astrolabe/rules';

import {
  launchReviewPath,
  launchSectionPath,
  LAUNCH_SECTION_ORDER,
  SECTION_ARRIVES_IN,
  SECTION_LABELS,
  SECTION_SUMMARIES,
} from './sections.js';

/**
 * The section dashboard's view model (task 4.1, A22).
 *
 * Every status and every blocker here is the server's, copied across
 * untouched. The client does not compute readiness, and it does not *correct*
 * readiness either — D-176, and the defect group 3R existed to remove. What
 * this module adds is ordering, wording, and where each card links to.
 */

/** Never colour alone (design record §10): the status always has words. */
export const STATUS_TEXT: Readonly<Record<LaunchSectionStatus, string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
};

export interface SectionCardView {
  readonly section: LaunchSection;
  readonly label: string;
  readonly summary: string;
  readonly href: string;
  /** The server's, verbatim. */
  readonly status: LaunchSectionStatus;
  readonly statusText: string;
  /** The server's, verbatim and in its order. */
  readonly blockers: readonly LaunchProblem[];
  /** False while the section's editor is still ahead; see `arrivesIn`. */
  readonly implemented: boolean;
  readonly arrivesIn: string | null;
}

/**
 * A22's "next useful action".
 *
 * It may well point at a section group 4 has not built. That is correct: the
 * next useful thing to do really is Truths, and the page it opens says plainly
 * that the tool is not there yet. Skipping placeholders would misreport how far
 * along the campaign is.
 */
export type NextAction =
  | {
      readonly kind: 'section';
      readonly section: LaunchSection;
      readonly label: string;
      readonly href: string;
    }
  | { readonly kind: 'review'; readonly label: string; readonly href: string };

export interface LaunchDashboard {
  readonly cards: readonly SectionCardView[];
  readonly nextAction: NextAction;
  readonly ready: boolean;
  readonly problemCount: number;
}

export function buildSectionCard(
  campaignId: string,
  section: LaunchSection,
  readiness: LaunchReadiness,
): SectionCardView {
  const { status, blockers } = readiness.sections[section];
  const arrivesIn = SECTION_ARRIVES_IN[section];
  return {
    section,
    label: SECTION_LABELS[section],
    summary: SECTION_SUMMARIES[section],
    href: launchSectionPath(campaignId, section),
    status,
    statusText: STATUS_TEXT[status],
    blockers,
    implemented: arrivesIn === null,
    arrivesIn,
  };
}

export function buildDashboard(campaignId: string, readiness: LaunchReadiness): LaunchDashboard {
  const cards = LAUNCH_SECTION_ORDER.map((section) =>
    buildSectionCard(campaignId, section, readiness),
  );
  return {
    cards,
    nextAction: nextUsefulAction(campaignId, cards),
    ready: readiness.ready,
    problemCount: readiness.problems.length,
  };
}

export function nextUsefulAction(
  campaignId: string,
  cards: readonly SectionCardView[],
): NextAction {
  const next = cards.find((card) => card.status !== 'complete');
  if (next === undefined) {
    return { kind: 'review', label: 'Review and launch', href: launchReviewPath(campaignId) };
  }
  return {
    kind: 'section',
    section: next.section,
    label: `${next.status === 'not_started' ? 'Start' : 'Continue'} ${next.label}`,
    href: next.href,
  };
}
