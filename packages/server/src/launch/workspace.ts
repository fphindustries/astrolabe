import {
  STARFORGED,
  validateLaunchReadiness,
  type LaunchReadiness,
  type LaunchReadinessInput,
} from '@astrolabe/rules';
import type { AstrolabeEvent, CampaignState, LaunchClosedReason } from '@astrolabe/shared';

import { launchClosedReason } from '../db/launch-commands.js';
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
            integrity: ship.integrity.value,
            assetId: ship.assetId,
            modules: ship.modules,
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
