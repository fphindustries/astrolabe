import { useMutation } from '@tanstack/react-query';
import type {
  AddSectorLocationResponse,
  ChallengeRank,
  SetTruthResponse,
  SwearIncitingVowResponse,
} from '@astrolabe/shared';
import type { OracleId } from '@astrolabe/rules';

import { useInvalidateCampaign } from './campaigns.js';
import { apiPost } from './http.js';

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
