import type { LaunchProblem, LaunchReadiness, LaunchSection } from '@astrolabe/rules';
import type { CharacterId } from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';

import { launchSectionPath, LAUNCH_SECTION_ORDER, SECTION_LABELS } from './sections.js';

/**
 * The review page's view model (task 4.3).
 *
 * Group 4 built the shell: the blockers, the summary, and the one-way Launch
 * confirmation. The review page also chooses who swears the vow, who shares
 * it, its rank and the opening scene's title (9.3, D-200), saved as a revision
 * of the accepted incident by `VowChoicesPanel`, so `POST /launch/activate`
 * still takes a `commandId` and nothing else. Here they are read back.
 */

export interface ProblemGroup {
  readonly section: LaunchSection;
  readonly label: string;
  readonly href: string;
  readonly problems: readonly LaunchProblem[];
}

export interface LaunchSummary {
  readonly campaignName: string;
  readonly premise: string | null;
  readonly truthsDecided: number;
  readonly crew: readonly string[];
  readonly starshipName: string | null;
  readonly startingSettlementName: string | null;
  readonly sectorTrouble: string | null;
  readonly connection: { readonly npcName: string; readonly role: string } | null;
  readonly incident: {
    readonly text: string;
    readonly rank: string;
    /** D-200: null until the review page chooses them. */
    readonly rollerName: string | null;
    /** Those who share the vow besides its roller; empty when the roller swears alone. */
    readonly participantNames: readonly string[] | null;
    readonly openingScene: string | null;
  } | null;
}

export interface LaunchReview {
  readonly ready: boolean;
  readonly launchEnabled: boolean;
  readonly groups: readonly ProblemGroup[];
  readonly problemCount: number;
  readonly summary: LaunchSummary;
}

export function groupProblemsBySection(
  campaignId: string,
  readiness: LaunchReadiness,
): readonly ProblemGroup[] {
  return LAUNCH_SECTION_ORDER.flatMap((section) => {
    const problems = readiness.problems.filter((problem) => problem.section === section);
    return problems.length === 0
      ? []
      : [
          {
            section,
            label: SECTION_LABELS[section],
            href: launchSectionPath(campaignId, section),
            problems,
          },
        ];
  });
}

export function buildReview(
  campaignId: string,
  workspace: { readonly state: CampaignState; readonly readiness: LaunchReadiness },
): LaunchReview {
  const { state, readiness } = workspace;
  const { launch } = state;
  // An id that names no character falls back to itself: a summary that says
  // too little is better than one that throws on the review screen.
  const nameOf = (characterId: CharacterId) => state.characters[characterId]?.name ?? characterId;
  const sectorTrouble = Object.values(launch.troubles).find((trouble) => trouble.kind === 'sector');
  const startingSettlement =
    launch.startingSettlementId === undefined
      ? undefined
      : launch.locations[launch.startingSettlementId];

  return {
    ready: readiness.ready,
    // Exactly the server's answer. Not `groups.length === 0`, which would be a
    // second readiness rule living on the client (D-176).
    launchEnabled: readiness.ready,
    groups: groupProblemsBySection(campaignId, readiness),
    problemCount: readiness.problems.length,
    summary: {
      campaignName: state.campaign?.name ?? '',
      premise: launch.foundation?.premise ?? null,
      truthsDecided: Object.keys(launch.truthDecisions).length,
      crew: Object.values(state.characters).map((character) => character.name),
      starshipName: launch.starship?.name ?? null,
      startingSettlementName: startingSettlement?.name ?? null,
      sectorTrouble: sectorTrouble?.text ?? null,
      connection: launch.connection
        ? { npcName: launch.connection.npcName, role: launch.connection.role }
        : null,
      incident: launch.incident
        ? {
            text: launch.incident.text,
            rank: launch.incident.rank,
            rollerName:
              launch.incident.rollerId === undefined ? null : nameOf(launch.incident.rollerId),
            participantNames:
              launch.incident.participants
                ?.filter((id) => id !== launch.incident?.rollerId)
                .map(nameOf) ?? null,
            openingScene: launch.incident.openingScene?.title ?? null,
          }
        : null,
    },
  };
}
