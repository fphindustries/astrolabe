import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AddSectorLocationResponse,
  ChallengeRank,
  ProposeIncidentsResponse,
  SetTruthResponse,
  SwearIncitingVowResponse,
} from '@astrolabe/shared';
import type { OracleId } from '@astrolabe/rules';

import { useInvalidateCampaign } from './campaigns.js';
import { apiPost } from './http.js';
import { aiKeys } from './narration.js';

/**
 * The rest of campaign setup (tasks 4.2–4.4), each its own command against
 * the campaign `CampaignCreationScreen`'s first step already created —
 * written incrementally as the player completes each step, not batched, so
 * a partial run survives a reload (design record §9's event-per-fact,
 * applied to setup the same way it applies to play).
 */

export type SetTruthInput =
  | { readonly oracleId: OracleId; readonly source: 'written'; readonly text: string }
  | { readonly oracleId: OracleId; readonly source: 'picked'; readonly rowIndex: number }
  | { readonly oracleId: OracleId; readonly source: 'rolled' };

export function useSetTruth(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: SetTruthInput) =>
      apiPost<SetTruthResponse>(`/campaigns/${campaignId}/truths`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

export interface AddSectorLocationInput {
  readonly name: string;
  readonly description: string;
}

export function useAddSectorLocation(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: AddSectorLocationInput) =>
      apiPost<AddSectorLocationResponse>(`/campaigns/${campaignId}/sector/locations`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

export interface AddSectorRouteInput {
  readonly fromLocationId: string;
  readonly toLocationId: string;
}

export function useAddSectorRoute(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: AddSectorRouteInput) =>
      apiPost<Record<string, never>>(`/campaigns/${campaignId}/sector/routes`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

export interface SwearIncitingVowInput {
  readonly title: string;
  readonly rank: ChallengeRank;
  /** D-132: the incident proposal the player started from, if any. */
  readonly proposalCommandId?: string;
}

export function useSwearIncitingVow(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: SwearIncitingVowInput) =>
      apiPost<SwearIncitingVowResponse>(`/campaigns/${campaignId}/inciting-vow`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

/** The answer, plus the command id swearing from it must name. */
export interface ProposedIncidents {
  readonly commandId: string;
  readonly response: ProposeIncidentsResponse;
}

/** Task 4.6 / D-132: ask the Guide for inciting incidents. An outage is an answer, not a thrown error. */
export function useProposeIncidents(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<ProposedIncidents> => {
      const commandId = crypto.randomUUID();
      const response = await apiPost<ProposeIncidentsResponse>(
        `/campaigns/${campaignId}/incident-proposals`,
        { commandId },
      );
      return { commandId, response };
    },
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}
