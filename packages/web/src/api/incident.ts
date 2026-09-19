import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AcceptLaunchIncidentRequestBody,
  AcceptLaunchIncidentResponse,
  ProposeIncidentsResponse,
} from '@astrolabe/shared';

import { useInvalidateCampaign } from './campaigns.js';
import { apiPost } from './http.js';
import { aiKeys } from './narration.js';

/**
 * The inciting incident's commands (9.2, 9.3).
 *
 * One route accepts and revises: the server mints the incident's id and keeps
 * it (9.0f). Beat 11 sends the words and rank; the review page sends the vow's
 * choices alone, and the server carries the rest forward (D-200).
 */
export function useAcceptIncident(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (body: Omit<AcceptLaunchIncidentRequestBody, 'commandId'>) =>
      apiPost<AcceptLaunchIncidentResponse>(`/campaigns/${campaignId}/launch/incident`, {
        commandId: crypto.randomUUID(),
        ...body,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Ask the Guide for three incidents (D-132). The server rolls one incident
 * per option, and holds the answer for review (9.0e). An outage comes back
 * `ok: false`; writing your own is as usable as it was (A42).
 */
export function useProposeIncidents(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<ProposeIncidentsResponse>(`/campaigns/${campaignId}/incident-proposals`, {
        commandId: crypto.randomUUID(),
      }),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}
