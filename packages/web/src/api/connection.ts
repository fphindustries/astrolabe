import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  EstablishLaunchConnectionResponse,
  ProposeConnectionResponse,
  RollLaunchRecipeResponse,
} from '@astrolabe/shared';

import type { SaveConnectionBody } from '../launch/connection-form.js';

import { useInvalidateCampaign } from './campaigns.js';
import { apiPost, apiPut } from './http.js';
import { aiKeys } from './narration.js';

/**
 * The local connection's commands (9.1, D-167).
 *
 * The first acceptance establishes it; after that a save revises it in place
 * (9.0a, D-202). The server owns every id, and decides whether an accepted
 * proposal was edited (9.0d). Field-level rolls use the crew's
 * `useRollLaunchOracle`, naming an oracle from the declared NPC recipe.
 */
export function useSaveConnection(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: { readonly body: SaveConnectionBody; readonly revise: boolean }) =>
      (input.revise ? apiPut : apiPost)<EstablishLaunchConnectionResponse>(
        `/campaigns/${campaignId}/launch/connection`,
        { commandId: crypto.randomUUID(), ...input.body },
      ),
    onSuccess: invalidate,
  });
}

/**
 * Ask the Guide for the person (9.0c, D-166, D-167).
 *
 * Two commands, in this order: the declared NPC recipe is rolled, and its
 * event ids ground the proposal. Nothing rolls the connection's outcome; the
 * rules made it a strong hit. An outage comes back `ok: false`, and every
 * manual path is as usable as it was (A42).
 */
export function useProposeConnection(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      readonly fields?: readonly string[];
    }): Promise<ProposeConnectionResponse> => {
      const rolled = await apiPost<RollLaunchRecipeResponse>(
        `/campaigns/${campaignId}/launch/recipe-rolls`,
        { commandId: crypto.randomUUID(), selector: { kind: 'starting_connection' } },
      );
      return apiPost<ProposeConnectionResponse>(`/campaigns/${campaignId}/connection-proposals`, {
        commandId: crypto.randomUUID(),
        groundedIn: rolled.results.map((result) => result.eventId),
        ...(input.fields === undefined ? {} : { fields: input.fields }),
      });
    },
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}
