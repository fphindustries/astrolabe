import type { LaunchSection } from '@astrolabe/rules';

/**
 * The seven Campaign Launch sections, their names, and the paths that reach
 * them (task 4.1, D-160).
 *
 * Nothing here decides whether a section is done — that is the server's
 * readiness payload, and keeping the two apart is the whole point of D-176.
 * This module owns display order, wording, and URLs, which the server has no
 * opinion about.
 */

/** D-160's order, which is also the order the workspace presents them in. */
export const LAUNCH_SECTION_ORDER: readonly LaunchSection[] = [
  'foundation',
  'truths',
  'crew',
  'starship',
  'sector',
  'connection_troubles',
  'incident_launch',
];

/** D-160's own wording, so the screen and the decision say the same words. */
export const SECTION_LABELS: Readonly<Record<LaunchSection, string>> = {
  foundation: 'Foundation',
  truths: 'Truths',
  crew: 'Crew',
  starship: 'Starship',
  sector: 'Starting Sector',
  connection_troubles: 'Connection and Troubles',
  incident_launch: 'Incident and Launch',
};

export const SECTION_SUMMARIES: Readonly<Record<LaunchSection, string>> = {
  foundation: 'The campaign’s name, its premise, and how the Guide narrates.',
  truths: 'The fourteen setting truths, answered or deliberately left open.',
  crew: 'One to six characters. At least one complete character launches.',
  starship: 'The crew’s one shared command starship and its installed modules.',
  sector: 'The starting sector: settlements, planets, passages, and its map.',
  connection_troubles: 'The local connection, and what troubles the settlement and the sector.',
  incident_launch: 'The inciting incident, and the vow that opens play.',
};

/**
 * Which group builds a section's editor, for the six that are still ahead.
 *
 * Group 4 is the workspace itself; the sections it navigates to arrive with
 * groups 5–9. A placeholder says so in plain words rather than showing a
 * disabled form, and this is where that sentence gets its name.
 */
export const SECTION_ARRIVES_IN: Readonly<Record<LaunchSection, string | null>> = {
  foundation: null,
  truths: null,
  crew: null,
  starship: null,
  sector: null,
  // Half built after 8.5: the troubles are here, the connection is ahead.
  connection_troubles: 'group 9',
  incident_launch: 'Incident and Launch (group 9)',
};

/**
 * Whether a path segment names a section.
 *
 * The route matcher imports this, which is why it lives here and stays free of
 * anything but data: `router.ts` is unit tested with no DOM at all.
 */
export function isLaunchSection(segment: string): segment is LaunchSection {
  return (LAUNCH_SECTION_ORDER as readonly string[]).includes(segment);
}

export const launchOverviewPath = (campaignId: string) => `/campaigns/${campaignId}/launch`;
export const launchSectionPath = (campaignId: string, section: LaunchSection) =>
  `/campaigns/${campaignId}/launch/${section}`;
export const launchReviewPath = (campaignId: string) => `/campaigns/${campaignId}/launch/review`;
export const playPath = (campaignId: string) => `/campaigns/${campaignId}/play`;
