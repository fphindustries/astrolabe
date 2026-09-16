import {
  STARFORGED,
  validateLaunchReadiness,
  type LaunchReadiness,
  type LaunchReadinessInput,
} from '@astrolabe/rules';
import type { AstrolabeEvent, CampaignState, PayloadFor } from '@astrolabe/shared';

import { project } from '../projection/project.js';

/**
 * The rules-aware half of Campaign Launch's read model.  It deliberately
 * lives outside `projection/`: the fold stores facts, while this adapter
 * applies the current launch validator to those facts.
 */
export interface LaunchWorkspace {
  readonly state: CampaignState;
  readonly readiness: LaunchReadiness;
}

export function buildLaunchWorkspace(events: readonly AstrolabeEvent[]): LaunchWorkspace {
  const state = project(events);
  const input = readinessInput(state);
  const readiness = validateLaunchReadiness(input, STARFORGED.truths, STARFORGED);
  if (state.launch.phase === 'active') return { state, readiness };
  return {
    state: {
      ...state,
      launch: { ...state.launch, phase: readiness.ready ? 'ready' : 'draft' },
    },
    readiness,
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
          : { title: character.backgroundVow.title, rank: character.backgroundVow.rank as never },
      ...(character.signatureGear !== undefined ? { signatureGear: character.signatureGear } : {}),
      ...(character.hooks.length > 0 ? { hooks: character.hooks } : {}),
    },
  }));
  const decisions = Object.entries(state.launch.truthDecisions).map(([truthId, value]) => {
    const decision = value as PayloadFor<'truth.decided'>;
    return {
      truthId,
      kind:
        decision.resolution === 'selected'
          ? 'selected'
          : decision.resolution === 'rolled'
            ? 'rolled'
            : decision.resolution === 'custom'
              ? 'custom'
              : 'leave_open',
      ...(decision.optionIndex !== undefined ? { optionIndex: decision.optionIndex } : {}),
      ...(decision.subchoiceId !== undefined ? { subchoiceId: decision.subchoiceId } : {}),
    } as const;
  });
  const ship = state.launch.starship as PayloadFor<'starship.established'> | undefined;
  const sector = state.launch.sector as PayloadFor<'sector.configured'> | undefined;
  const connection = state.launch.connection as PayloadFor<'connection.established'> | undefined;
  const incident = state.launch.incident as PayloadFor<'incident.accepted'> | undefined;
  const locations = Object.values(state.launch.locations) as PayloadFor<'location.added'>[];
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
    }));
  const planets = locations
    .filter((location) => location.kind === 'planet')
    .map((location) => ({
      id: location.id,
      name: location.name,
      class: location.planetClass,
      ...location.details,
    }));
  return {
    campaignName: state.campaign?.name ?? '',
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
            routes: state.launch.routes as never,
            ...(state.launch.startingSettlementId !== undefined
              ? { startingSettlementId: state.launch.startingSettlementId }
              : {}),
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
