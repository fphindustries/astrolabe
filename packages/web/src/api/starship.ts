import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ProposeStarshipResponse,
  RollLaunchRecipeResponse,
  SaveSharedStarshipResponse,
} from '@astrolabe/shared';

import type { SaveStarshipBody } from '../launch/starship-form.js';

import { apiPost } from './http.js';
import { useInvalidateCampaign } from './campaigns.js';
import { aiKeys } from './narration.js';

/**
 * The Campaign Launch starship commands (7.1).
 *
 * The body states what the player wrote and what it came from; the server
 * owns the ship's id, asset and integrity (7.0a, 7.0b) and decides whether an
 * accepted proposal was edited (7.0c). Field-level rolls use the crew's
 * `useRollLaunchOracle`, naming an oracle from the declared starship recipe.
 */
export function useSaveStarship(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (body: SaveStarshipBody) =>
      apiPost<SaveSharedStarshipResponse>(`/campaigns/${campaignId}/launch/starship`, {
        commandId: crypto.randomUUID(),
        ...body,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Ask the Guide for the ship (7.0e, D-166).
 *
 * Two commands, in this order: the declared starship recipe is rolled, and its
 * event ids ground the proposal. If the provider is unavailable the rolls are
 * still the player's; an outage comes back `ok: false`, and every manual path
 * is as usable as it was (A42).
 */
export function useProposeStarship(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      readonly quirkCount: 1 | 2;
      readonly fields?: readonly string[];
    }): Promise<ProposeStarshipResponse> => {
      const rolled = await apiPost<RollLaunchRecipeResponse>(
        `/campaigns/${campaignId}/launch/recipe-rolls`,
        {
          commandId: crypto.randomUUID(),
          selector: { kind: 'starship', quirkCount: input.quirkCount },
        },
      );
      return apiPost<ProposeStarshipResponse>(`/campaigns/${campaignId}/starship-proposals`, {
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
