import {
  planetClassFromRow,
  settlementLocationFromRow,
  type LaunchRecipeSelector,
  type LaunchRegion,
} from '@astrolabe/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ConfigureLaunchSectorResponse,
  ProposeSectorResponse,
  ProposeSettlementResponse,
  ProposeTroubleResponse,
  RollLaunchRecipeResponse,
  SaveLaunchLocationRequestBody,
  SaveLaunchLocationResponse,
  SaveLaunchRouteResponse,
  SaveLaunchTroubleRequestBody,
  SaveLaunchTroubleResponse,
  SetSectorLayoutRequestBody,
} from '@astrolabe/shared';

import type { ConfigureSectorBody } from '../launch/sector-form.js';

import { apiDelete, apiPost, apiPut } from './http.js';
import { useInvalidateCampaign } from './campaigns.js';
import { aiKeys } from './narration.js';

/**
 * The Starting Sector commands (group 8).
 *
 * Each body states what the player wrote and what it came from. The server
 * owns every id (8.0a, 8.0f) and decides whether an accepted proposal was
 * edited (8.0f). A whole-object Roll rolls a declared recipe; a one-field Roll
 * uses the crew's `useRollLaunchOracle` against that recipe's own oracle
 * (3R.5c).
 */

const commandId = () => crypto.randomUUID();

export function useConfigureSector(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (body: ConfigureSectorBody) =>
      apiPost<ConfigureLaunchSectorResponse>(`/campaigns/${campaignId}/launch/sector`, {
        commandId: commandId(),
        ...body,
      }),
    onSuccess: invalidate,
  });
}

/** Roll a declared recipe; the results are recorded rolls a field can cite (A41). */
export function useRollLaunchRecipe(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (selector: LaunchRecipeSelector) =>
      apiPost<RollLaunchRecipeResponse>(`/campaigns/${campaignId}/launch/recipe-rolls`, {
        commandId: commandId(),
        selector,
      }),
    onSuccess: invalidate,
  });
}

export type SaveLocationBody = Omit<SaveLaunchLocationRequestBody, 'commandId'>;

export function useSaveLocation(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (body: SaveLocationBody) =>
      apiPost<SaveLaunchLocationResponse>(`/campaigns/${campaignId}/launch/locations`, {
        commandId: commandId(),
        ...body,
      }),
    onSuccess: invalidate,
  });
}

/** Remove a location before launch (8.0g). Append-only: the reason is required. */
export function useRemoveLocation(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: { readonly locationId: string; readonly reason: string }) =>
      apiDelete<{ readonly locationId: string }>(
        `/campaigns/${campaignId}/launch/locations/${input.locationId}`,
        { commandId: commandId(), reason: input.reason },
      ),
    onSuccess: invalidate,
  });
}

export type RouteEndpoint = string | { readonly kind: 'off_map'; readonly label: string };

export function useSaveRoute(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (route: { readonly from: string; readonly to: RouteEndpoint }) =>
      apiPost<SaveLaunchRouteResponse>(`/campaigns/${campaignId}/launch/routes`, {
        commandId: commandId(),
        route,
      }),
    onSuccess: invalidate,
  });
}

/** Remove a passage before launch (8.0g); named by its endpoints, either way round. */
export function useRemoveRoute(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: {
      readonly route: { readonly from: string; readonly to: RouteEndpoint };
      readonly reason: string;
    }) =>
      apiDelete<{ readonly from: string }>(`/campaigns/${campaignId}/launch/routes`, {
        commandId: commandId(),
        route: input.route,
        reason: input.reason,
      }),
    onSuccess: invalidate,
  });
}

/** The complete map layout, written once per save, never per pointer move (8.4). */
export function useSetLayout(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (coordinates: SetSectorLayoutRequestBody['coordinates']) =>
      apiPut<{ readonly locations: number }>(`/campaigns/${campaignId}/launch/sector-layout`, {
        commandId: commandId(),
        coordinates,
      }),
    onSuccess: invalidate,
  });
}

export function useSetStartingSettlement(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (settlementId: string) =>
      apiPost<{ readonly settlementId: string }>(
        `/campaigns/${campaignId}/launch/starting-settlement`,
        { commandId: commandId(), settlementId },
      ),
    onSuccess: invalidate,
  });
}

export type SaveTroubleBody = Omit<SaveLaunchTroubleRequestBody, 'commandId'>;

export function useSaveTrouble(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (body: SaveTroubleBody) =>
      apiPost<SaveLaunchTroubleResponse>(`/campaigns/${campaignId}/launch/troubles`, {
        commandId: commandId(),
        ...body,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Ask the Guide for a settlement (8.0e, D-196). The client rolls first — the
 * settlement recipe, and any planet or first-look recipes it wants — and the
 * proposal cites those rolls. An outage comes back `ok: false`; every manual
 * path is as usable as it was (A42).
 */
export function useProposeSettlement(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      readonly targetId: string;
      readonly groundedIn: readonly string[];
      readonly fields?: readonly string[];
    }) =>
      apiPost<ProposeSettlementResponse>(`/campaigns/${campaignId}/settlement-proposals`, {
        commandId: commandId(),
        targetId: input.targetId,
        groundedIn: input.groundedIn,
        ...(input.fields === undefined ? {} : { fields: input.fields }),
      }),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}

/** Ask the Guide to interpret a rolled trouble (8.0e, D-194). */
export function useProposeTrouble(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { readonly groundedIn: readonly string[] } & (
        { readonly kind: 'sector' } | { readonly kind: 'settlement'; readonly ownerId: string }
      ),
    ) =>
      apiPost<ProposeTroubleResponse>(`/campaigns/${campaignId}/trouble-proposals`, {
        commandId: commandId(),
        ...input,
      }),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}

/**
 * Ask the Guide for one whole settlement (8.2, D-196), rolling first.
 *
 * The settlement recipe for the region, then, if its location roll put the
 * settlement on or above a world, a planet class and that class's shallow
 * planet (D-173: class before its class-specific recipe). Every roll is its
 * own recorded command, and the proposal cites them all.
 */
export function useAskForSettlement(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      readonly targetId: string;
      readonly region: LaunchRegion;
      readonly projectCount: 1 | 2;
      readonly fields?: readonly string[];
    }): Promise<ProposeSettlementResponse> => {
      const roll = (selector: LaunchRecipeSelector) =>
        apiPost<RollLaunchRecipeResponse>(`/campaigns/${campaignId}/launch/recipe-rolls`, {
          commandId: commandId(),
          selector,
        });
      const settlement = await roll({
        kind: 'settlement',
        region: input.region,
        projectCount: input.projectCount,
      });
      const ids = settlement.results.map((result) => result.eventId);
      const location = settlementLocationFromRow(
        settlement.results.find((result) => result.slot === 'location')?.text ?? '',
      );
      if (location === 'planetside' || location === 'orbital') {
        const rolledClass = await roll({ kind: 'planet_class' });
        const planetClass = planetClassFromRow(rolledClass.results[0]?.text ?? '');
        if (planetClass !== undefined) {
          const planet = await roll({ kind: 'planet', planetClass, depth: 'shallow' });
          ids.push(
            ...rolledClass.results.map((result) => result.eventId),
            ...planet.results.map((result) => result.eventId),
          );
        }
      }
      return apiPost<ProposeSettlementResponse>(`/campaigns/${campaignId}/settlement-proposals`, {
        commandId: commandId(),
        targetId: input.targetId,
        groundedIn: ids,
        ...(input.fields === undefined ? {} : { fields: input.fields }),
      });
    },
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}

/**
 * Ask the Guide for the whole sector (8.6, D-196). The server rolls every
 * recipe and answers one proposal per object; nothing is accepted here.
 */
export function useProposeSector(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<ProposeSectorResponse>(`/campaigns/${campaignId}/sector-proposals`, {
        commandId: commandId(),
      }),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}
