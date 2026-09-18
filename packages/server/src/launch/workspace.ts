import {
  STARFORGED,
  validateLaunchReadiness,
  type LaunchReadiness,
  type LaunchReadinessInput,
  type LaunchSection,
} from '@astrolabe/rules';
import type {
  AstrolabeEvent,
  CampaignState,
  EventId,
  LaunchClosedReason,
  OracleChip,
} from '@astrolabe/shared';

import { launchClosedReason } from '../db/launch-commands.js';
import { oracleChips } from '../projection/narrative-log.js';
import { project } from '../projection/project.js';

/**
 * The rules-aware half of Campaign Launch's read model.  It deliberately
 * lives outside `projection/`: the fold stores facts, while this adapter
 * applies the current launch validator to those facts.
 */
export interface LaunchWorkspace {
  readonly state: CampaignState;
  readonly readiness: LaunchReadiness;
  readonly launchOpen: boolean;
  readonly closedReason?: LaunchClosedReason;
  readonly chips: Readonly<Record<EventId, OracleChip>>;
}

export function buildLaunchWorkspace(events: readonly AstrolabeEvent[]): LaunchWorkspace {
  const state = project(events);
  const input = readinessInput(state);
  const readiness = validateLaunchReadiness(input, STARFORGED.truths, STARFORGED);
  // Asked of the projected state, before the phase override below: that is the
  // state a launch command would see, and the point of the field is to answer
  // exactly as the command's own refusal would (D-178).
  const closedReason = launchClosedReason(state);
  const open = {
    launchOpen: closedReason === undefined,
    ...(closedReason ? { closedReason } : {}),
    chips: launchChips(events, state),
  };
  if (state.launch.phase === 'active') return { state, readiness, ...open };
  return {
    state: {
      ...state,
      launch: { ...state.launch, phase: readiness.ready ? 'ready' : 'draft' },
    },
    readiness,
    ...open,
  };
}

/**
 * The oracle rolls the launch's accepted facts were built on, resolved (A41).
 *
 * Every accepted launch fact carries `groundedIn`: the ids of the
 * `oracle.rolled` events behind it. Ids alone render nothing — a rolled truth
 * can say it was rolled but not what came up on which table — and a truth is
 * not an entity, so `/entities/:entityId/grounding` cannot answer for it.
 * Resolving them here, beside the state rather than inside it, is the same
 * arrangement `readiness` uses: the fold stores facts; this adapter resolves
 * them.
 *
 * The citations are collected by walking the launch state for `groundedIn`
 * arrays rather than by listing each section's field. A per-section list would
 * need an edit every time a section lands, and a section whose author forgot
 * would ship chips that silently resolve to nothing — the failure this whole
 * group keeps finding. Ids that name something other than a roll resolve to no
 * chip, so over-collecting is safe.
 *
 * **Crew is walked separately, and this is why (6.0b, D-184).** Walking
 * `state.launch` was written as though it covered every section, and group 5's
 * implementation note said groups 6–9 would need no edit here. That holds only
 * for facts stored *under* `state.launch`, and crew is the one section whose
 * accepted facts are not: a character projects to `state.characters`. So a
 * crew member's chips resolved to nothing, silently — exactly the failure the
 * walk-don't-list approach was chosen to avoid, arriving through the one door
 * it did not cover. Superseded versions need no line of their own:
 * `crewHistory` lives inside `state.launch` and the first walk already reaches
 * it.
 */
function launchChips(
  events: readonly AstrolabeEvent[],
  state: CampaignState,
): Readonly<Record<EventId, OracleChip>> {
  const cited = new Set<EventId>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'groundedIn' && Array.isArray(child)) {
        for (const id of child) if (typeof id === 'string') cited.add(id as EventId);
        continue;
      }
      walk(child);
    }
  };
  walk(state.launch);
  walk(state.characters);
  const chips = oracleChips(events)([...cited]);
  return Object.fromEntries(chips.map((chip) => [chip.eventId, chip]));
}

function readinessInput(state: CampaignState): LaunchReadinessInput {
  const characters = Object.values(state.characters).map((character) => ({
    id: character.id,
    draft: {
      name: character.name,
      callsign: character.callsign,
      stats: character.stats,
      assets: character.assets,
      ...(character.pronouns !== null ? { pronouns: character.pronouns } : {}),
      appearance: character.appearance ?? '',
      backstory: character.backstory ?? { kind: 'written' as const, text: '' },
      backgroundVow:
        character.backgroundVow === undefined
          ? { title: '', rank: 'troublesome' as const }
          : character.backgroundVow,
      ...(character.signatureGear !== undefined ? { signatureGear: character.signatureGear } : {}),
      ...(character.hooks.length > 0 ? { hooks: character.hooks } : {}),
    },
  }));
  const decisions = Object.entries(state.launch.truthDecisions).map(([truthId, value]) => {
    return {
      truthId,
      kind:
        value.resolution === 'selected'
          ? 'selected'
          : value.resolution === 'rolled'
            ? 'rolled'
            : value.resolution === 'custom'
              ? 'custom'
              : 'leave_open',
      ...(value.optionIndex !== undefined ? { optionIndex: value.optionIndex } : {}),
      ...(value.subchoiceId !== undefined ? { subchoiceId: value.subchoiceId } : {}),
    } as const;
  });
  const ship = state.launch.starship;
  const sector = state.launch.sector;
  const connection = state.launch.connection;
  const incident = state.launch.incident;
  const locations = Object.values(state.launch.locations);
  // Trouble is a fact of its own aggregate, so readiness only sees it if this
  // layer carries it across. Forgetting to made `sector_trouble_missing`
  // permanent and activation unreachable; `workspace.test.ts` guards it.
  const troubles = Object.values(state.launch.troubles);
  const sectorTrouble = troubles.find((trouble) => trouble.kind === 'sector');
  const settlementTrouble = new Map<string, string>(
    troubles.flatMap((trouble) =>
      trouble.kind === 'settlement' ? [[trouble.ownerId, trouble.text] as const] : [],
    ),
  );
  const settlements = locations
    .filter((location) => location.kind === 'settlement')
    .map((location) => ({
      id: location.id,
      name: location.name,
      location: location.location,
      population: location.population,
      authority: location.authority,
      projects: location.projects,
      ...(location.planetId !== undefined ? { planetId: location.planetId } : {}),
      ...(location.firstLooks !== undefined ? { firstLooks: location.firstLooks } : {}),
      ...troubleOf(settlementTrouble, location.id),
    }));
  const planets = locations.flatMap((location) =>
    location.kind === 'planet'
      ? [
          {
            id: location.id,
            name: location.name,
            class: location.planetClass,
            // Named fields on both sides now (D-174), so the depth rule reads
            // what the command wrote rather than what it happened to key.
            ...(location.details.atmosphere === undefined
              ? {}
              : { atmosphere: location.details.atmosphere }),
            ...(location.details.observedFromSpace === undefined
              ? {}
              : { observedFromSpace: location.details.observedFromSpace }),
            ...(location.details.feature === undefined
              ? {}
              : { feature: location.details.feature }),
          },
        ]
      : [],
  );
  return {
    campaignName: state.campaign?.name ?? '',
    // D-187. The keys are exactly the sections with a saved snapshot, which is
    // the fold's own answer to "has the player done work here" — readiness
    // stays pure and derives nothing about storage itself.
    draftedSections: Object.keys(state.launch.drafts) as LaunchSection[],
    // D-181. Only the accepted foundation counts: a saved draft is not canon
    // (D-161), so a premise still sitting in a draft does not clear the blocker.
    ...(state.launch.foundation === undefined ? {} : { premise: state.launch.foundation.premise }),
    truths: decisions,
    characters,
    ...(ship === undefined
      ? {}
      : {
          starship: {
            name: ship.name,
            appearance: ship.appearance,
            history: ship.history,
            quirks: ship.quirks,
            integrity: ship.integrity,
            assetId: ship.assetId,
          },
        }),
    ...(sector === undefined
      ? {}
      : {
          sector: {
            region: sector.region,
            settlements,
            locations: locations
              .filter((location) => location.kind === 'other')
              .map((location) => location.id),
            planets,
            routes: state.launch.routes,
            ...(state.launch.startingSettlementId !== undefined
              ? { startingSettlementId: state.launch.startingSettlementId }
              : {}),
            ...(sectorTrouble !== undefined ? { sectorTrouble: sectorTrouble.text } : {}),
            ...(sector.starId !== undefined ? { star: sector.starId } : {}),
          },
        }),
    ...(connection === undefined
      ? {}
      : {
          connection: {
            npcName: connection.npcName,
            role: connection.role,
            rank: connection.rank,
            participants: connection.participants,
          },
        }),
    ...(incident === undefined
      ? {}
      : {
          incident: {
            text: incident.text,
            rank: incident.rank,
            rollerId: incident.rollerId,
            participants: incident.participants,
            openingScene: incident.openingScene.title,
          },
        }),
  };
}

/** `exactOptionalPropertyTypes` wants the key absent, not set to undefined. */
function troubleOf(
  troubles: ReadonlyMap<string, string>,
  settlementId: string,
): { trouble?: string } {
  const trouble = troubles.get(settlementId);
  return trouble === undefined ? {} : { trouble };
}
