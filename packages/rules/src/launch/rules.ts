import type { SettingTruth } from '../schema/truths.js';
import type { RulesetForCreation } from '../characters/creation.js';
import {
  validateLaunchCharacterDraft,
  duplicateModuleHolders,
  validateSharedStarship,
  type LaunchCharacterDraft,
  type SharedStarshipDraft,
} from '../characters/launch-creation.js';
import type { ChallengeRank } from '../characters/launch-creation.js';

export type LaunchRegion = 'terminus' | 'outlands' | 'expanse';
/**
 * The starting sector's settlement and passage counts, by region (D-174).
 *
 * The numbers are the rulebook's and are verified against it. Their *status*
 * here is Astrolabe's own (D-180): Chapter 2 offers them as a recommendation
 * for its own exercise rather than a standard, and this enforces them as a
 * readiness gate anyway, so a new campaign launches into a sector with enough
 * in it to play. A thinner sector is legal at the table; it is refused here on
 * purpose.
 *
 * Scoped to Campaign Launch. The same passage that gives these numbers says
 * they are not how sectors are populated in general, so exploration must not
 * inherit them.
 *
 * `citation` records where the numbers come from: those pages are outside the
 * CC-BY subset, so they are cited and never quoted, and no test can check the
 * values themselves.
 */
export const REGION_BASELINES: Readonly<
  Record<
    LaunchRegion,
    { readonly settlements: number; readonly passages: number; readonly citation: string }
  >
> = {
  terminus: {
    settlements: 4,
    passages: 3,
    citation: 'Ironsworn: Starforged Rulebook, pp. 116–120',
  },
  outlands: {
    settlements: 3,
    passages: 2,
    citation: 'Ironsworn: Starforged Rulebook, pp. 116–120',
  },
  expanse: { settlements: 2, passages: 1, citation: 'Ironsworn: Starforged Rulebook, pp. 116–120' },
};
export type LaunchSection =
  | 'foundation'
  | 'truths'
  | 'crew'
  | 'starship'
  | 'sector'
  | 'connection_troubles'
  | 'incident_launch';
export type LaunchSectionStatus = 'not_started' | 'in_progress' | 'complete';
export interface LaunchProblem {
  readonly section: LaunchSection;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}
export type TruthDecision = {
  readonly truthId: string;
  readonly kind: 'selected' | 'rolled' | 'custom' | 'leave_open';
  readonly optionIndex?: number;
  readonly subchoiceId?: string;
};
export interface LaunchSettlement {
  readonly id: string;
  readonly name: string;
  readonly location: 'planetside' | 'orbital' | 'deep_space';
  readonly population: string;
  readonly authority: string;
  readonly projects: readonly string[];
  readonly planetId?: string;
  readonly firstLooks?: readonly string[];
  readonly trouble?: string;
}
export interface LaunchPlanet {
  readonly id: string;
  readonly class: string;
  readonly name: string;
  readonly atmosphere?: string;
  readonly observedFromSpace?: string;
  readonly feature?: string;
}
export interface LaunchRoute {
  readonly from: string;
  readonly to: string | { readonly kind: 'off_map'; readonly label: string };
}
export interface LaunchSector {
  readonly region: LaunchRegion;
  readonly settlements: readonly LaunchSettlement[];
  readonly locations: readonly string[];
  readonly planets: readonly LaunchPlanet[];
  readonly routes: readonly LaunchRoute[];
  readonly startingSettlementId?: string;
  readonly sectorTrouble?: string;
}
export interface LaunchConnection {
  readonly npcName: string;
  readonly role: string;
  readonly rank: ChallengeRank;
  readonly participants: readonly string[];
}
export interface LaunchIncident {
  readonly text: string;
  readonly rank: ChallengeRank;
  readonly rollerId: string;
  readonly participants: readonly string[];
  readonly openingScene: string;
}
export interface LaunchReadinessInput {
  readonly campaignName: string;
  /**
   * D-181: a launch needs a premise, and the campaign settings do not gate
   * readiness — they always have defaults. `setLaunchFoundation` already
   * refuses a blank premise; this is the same rule, stated once.
   */
  readonly premise?: string;
  readonly truths: readonly TruthDecision[];
  /** In creation order: D-191 installs a module held twice from the earlier holder. */
  readonly characters: readonly { readonly id: string; readonly draft: LaunchCharacterDraft }[];
  readonly starship?: SharedStarshipDraft;
  readonly sector?: LaunchSector;
  readonly connection?: LaunchConnection;
  readonly incident?: LaunchIncident;
  /**
   * The sections that have a saved draft (D-187).
   *
   * A draft **starts** a section and never completes one. D-161 makes it
   * durable and not canon, so it clears no blocker; only an accepted fact
   * does. Without this, a player who saved a half-built character and reopened
   * the workspace read "Crew — Not started" beside their own saved work, which
   * is worse for Crew than anywhere else: a truth is accepted the moment it is
   * decided, while a character sits in a draft for its entire build.
   *
   * Supplied by the caller from the projected drafts, so this stays pure and
   * the client keeps no second readiness rule of its own (D-176).
   *
   * Required, and empty rather than absent when there are none. Optional would
   * let a caller quietly stop carrying it, which is the failure this group has
   * now found four times — a fact written, and read by nobody, with nothing
   * failing to compile. Here the compiler asks.
   */
  readonly draftedSections: readonly LaunchSection[];
}
export interface LaunchReadiness {
  readonly ready: boolean;
  readonly problems: readonly LaunchProblem[];
  readonly sections: Readonly<
    Record<
      LaunchSection,
      { readonly status: LaunchSectionStatus; readonly blockers: readonly LaunchProblem[] }
    >
  >;
}

const SECTIONS: readonly LaunchSection[] = [
  'foundation',
  'truths',
  'crew',
  'starship',
  'sector',
  'connection_troubles',
  'incident_launch',
];
const nonblank = (text: string | undefined) => text !== undefined && text.trim() !== '';

export function validateLaunchReadiness(
  input: LaunchReadinessInput,
  truths: readonly SettingTruth[],
  ruleset: RulesetForCreation,
): LaunchReadiness {
  const problems: LaunchProblem[] = [];
  const add = (section: LaunchSection, code: string, path: string, message: string) =>
    problems.push({ section, code, path, message });
  if (!nonblank(input.campaignName))
    add('foundation', 'campaign_name_required', 'campaignName', 'A campaign needs a name.');
  if (!nonblank(input.premise))
    add('foundation', 'premise_required', 'premise', 'A campaign needs a premise.');
  const decisions = new Map(input.truths.map((decision) => [decision.truthId, decision]));
  for (const truth of truths) {
    const decision = decisions.get(truth.id);
    if (!decision)
      add(
        'truths',
        'truth_missing',
        `truths.${truth.id}`,
        `${truth.name} must be answered or left open.`,
      );
    else if (decision.kind === 'selected' || decision.kind === 'rolled') {
      const option = truth.rows[decision.optionIndex ?? -1];
      if (!option)
        add(
          'truths',
          'truth_option_invalid',
          `truths.${truth.id}`,
          `${truth.name} needs a valid selected option.`,
        );
      else if (option.subchoice && !decision.subchoiceId)
        add(
          'truths',
          'truth_subchoice_missing',
          `truths.${truth.id}`,
          `${truth.name} needs its nested choice.`,
        );
    }
  }
  if (input.characters.length < 1 || input.characters.length > 6)
    add(
      'crew',
      'crew_count_invalid',
      'characters',
      'Campaign Launch requires one to six characters.',
    );
  for (const character of input.characters)
    for (const problem of validateLaunchCharacterDraft(character.draft, ruleset))
      add('crew', problem.code, `characters.${character.id}.${problem.field}`, problem.message);
  const crewIds = input.characters.map((character) => character.id);
  // D-191: one ship installs a module once, so a second holder is a Crew
  // problem, reported on the later character where the choice was made.
  const crewAssets = input.characters.map((character) => ({
    id: character.id,
    assets: character.draft.assets,
  }));
  for (const duplicate of duplicateModuleHolders(crewAssets, ruleset)) {
    const module = ruleset.assets.find((asset) => asset.id === duplicate.assetId)?.name;
    const owner = input.characters.find((c) => c.id === duplicate.installedBy)?.draft.name;
    add(
      'crew',
      'module_duplicate',
      `characters.${duplicate.characterId}.assets`,
      `${module ?? duplicate.assetId} is already installed by ${owner ?? 'another crew member'}; the ship cannot install it twice.`,
    );
  }
  if (!input.starship)
    add('starship', 'starship_missing', 'starship', 'Campaign Launch needs a shared starship.');
  else
    for (const problem of validateSharedStarship(input.starship, ruleset))
      add('starship', problem.code, `starship.${problem.field}`, problem.message);
  validateSector(input.sector, add);
  if (!input.connection)
    add(
      'connection_troubles',
      'connection_missing',
      'connection',
      'Campaign Launch needs a local connection.',
    );
  else {
    if (!nonblank(input.connection.npcName) || !nonblank(input.connection.role))
      add(
        'connection_troubles',
        'connection_incomplete',
        'connection',
        'The local connection needs an NPC and role.',
      );
    if (
      input.connection.participants.length === 0 ||
      input.connection.participants.some((id) => !crewIds.includes(id))
    )
      add(
        'connection_troubles',
        'connection_participants_invalid',
        'connection.participants',
        'Connection participants must be crew members.',
      );
  }
  if (!input.incident)
    add(
      'incident_launch',
      'incident_missing',
      'incident',
      'Campaign Launch needs an inciting incident.',
    );
  else {
    if (!nonblank(input.incident.text) || !nonblank(input.incident.openingScene))
      add(
        'incident_launch',
        'incident_incomplete',
        'incident',
        'The incident and opening scene are required.',
      );
    if (
      !crewIds.includes(input.incident.rollerId) ||
      input.incident.participants.length === 0 ||
      input.incident.participants.some((id) => !crewIds.includes(id))
    )
      add(
        'incident_launch',
        'incident_participants_invalid',
        'incident.participants',
        'The vow roller and participants must be crew members.',
      );
  }
  const sections = SECTIONS.reduce(
    (result, section) => {
      const blockers = problems.filter((problem) => problem.section === section);
      const status: LaunchSectionStatus =
        blockers.length === 0
          ? 'complete'
          : sectionStarted(section, input)
            ? 'in_progress'
            : 'not_started';
      result[section] = { status, blockers };
      return result;
    },
    {} as Record<
      LaunchSection,
      { status: LaunchSectionStatus; blockers: readonly LaunchProblem[] }
    >,
  );
  return { ready: problems.length === 0, problems, sections };
}
function sectionStarted(section: LaunchSection, input: LaunchReadinessInput): boolean {
  // D-187: saved work starts a section, whatever has been accepted in it.
  if (input.draftedSections.includes(section)) return true;
  return {
    foundation: input.campaignName !== '',
    truths: input.truths.length > 0,
    crew: input.characters.length > 0,
    starship: input.starship !== undefined,
    sector: input.sector !== undefined,
    connection_troubles:
      input.connection !== undefined || input.sector?.sectorTrouble !== undefined,
    incident_launch: input.incident !== undefined,
  }[section];
}
function validateSector(
  sector: LaunchSector | undefined,
  add: (s: LaunchSection, c: string, p: string, m: string) => void,
): void {
  if (!sector) {
    add('sector', 'sector_missing', 'sector', 'Campaign Launch needs a starting sector.');
    return;
  }
  const baseline = REGION_BASELINES[sector.region];
  if (sector.settlements.length < baseline.settlements)
    add(
      'sector',
      'settlements_insufficient',
      'sector.settlements',
      `${sector.region} needs ${baseline.settlements} settlements.`,
    );
  if (sector.routes.length < baseline.passages)
    add(
      'sector',
      'passages_insufficient',
      'sector.routes',
      `${sector.region} needs ${baseline.passages} passages.`,
    );
  const ids = new Set(sector.settlements.map((settlement) => settlement.id));
  const endpoints = new Set([...ids, ...sector.locations]);
  const planets = new Map(sector.planets.map((planet) => [planet.id, planet]));
  const edges = new Set<string>();
  for (const settlement of sector.settlements) {
    if (
      ![settlement.name, settlement.population, settlement.authority].every(nonblank) ||
      settlement.projects.length < 1 ||
      settlement.projects.length > 2 ||
      settlement.projects.some((project) => !nonblank(project))
    )
      add(
        'sector',
        'settlement_incomplete',
        `sector.settlements.${settlement.id}`,
        'Every settlement needs name, population, authority, and one or two projects.',
      );
    if (
      (settlement.location === 'planetside' || settlement.location === 'orbital') &&
      (!settlement.planetId || !planets.has(settlement.planetId))
    )
      add(
        'sector',
        'settlement_planet_missing',
        `sector.settlements.${settlement.id}.planetId`,
        'Planetside and orbital settlements need a shallow planet.',
      );
  }
  for (const route of sector.routes) {
    const to = typeof route.to === 'string' ? route.to : `off:${route.to.label}`;
    if (!endpoints.has(route.from) || (typeof route.to === 'string' && !endpoints.has(route.to)))
      add(
        'sector',
        'route_endpoint_unknown',
        'sector.routes',
        'Passages must connect known locations or an off-map exit.',
      );
    if (route.from === to)
      add(
        'sector',
        'route_self_link',
        'sector.routes',
        'A passage cannot link a location to itself.',
      );
    const key = [route.from, to].sort().join('|');
    if (edges.has(key))
      add('sector', 'route_duplicate', 'sector.routes', 'Duplicate passages are not allowed.');
    edges.add(key);
  }
  const start = sector.settlements.find(
    (settlement) => settlement.id === sector.startingSettlementId,
  );
  if (!start)
    add(
      'sector',
      'starting_settlement_missing',
      'sector.startingSettlementId',
      'Choose a starting settlement.',
    );
  else {
    if (!start.trouble || !start.firstLooks?.length)
      add(
        'sector',
        'starting_settlement_detail_missing',
        `sector.settlements.${start.id}`,
        'The starting settlement needs first look and trouble.',
      );
    if (start.planetId) {
      const planet = planets.get(start.planetId);
      if (!planet || ![planet.atmosphere, planet.observedFromSpace, planet.feature].every(nonblank))
        add(
          'sector',
          'starting_planet_detail_missing',
          `sector.planets.${start.planetId}`,
          'The starting planet needs atmosphere, observed-from-space detail, and a feature.',
        );
    }
  }
  if (!nonblank(sector.sectorTrouble))
    add(
      'connection_troubles',
      'sector_trouble_missing',
      'sector.sectorTrouble',
      'Campaign Launch needs sector trouble.',
    );
}
