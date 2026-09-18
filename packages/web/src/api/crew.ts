import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCharacterResponse,
  ProposeCharacterResponse,
  RemoveCharacterResponse,
  ReviseCharacterResponse,
  RollLaunchOracleResponse,
  RollLaunchRecipeResponse,
} from '@astrolabe/shared';

import { apiDelete, apiPost, apiPut } from './http.js';
import { useInvalidateCampaign } from './campaigns.js';
import { aiKeys } from './narration.js';

/**
 * The Campaign Launch crew commands (6.1, 6.4).
 *
 * Separate from `characters.ts`, which is Milestone 1's creation screen: these
 * write through the launch routes, which grant no per-character starship
 * (D-171) and refuse once a campaign is in play (D-178). `commandId` is minted
 * here, per command, as every other command in the app does.
 */

export interface AcceptCrewMemberInput {
  readonly draft: {
    readonly name: string;
    readonly callsign: string;
    readonly stats: Readonly<Record<string, number>>;
    readonly assets: readonly string[];
  };
  readonly backgroundVow: { readonly title: string; readonly rank: string };
  readonly launch: {
    readonly appearance: string;
    readonly backstory:
      { readonly kind: 'written'; readonly text: string } | { readonly kind: 'discover_in_play' };
    readonly signatureGear?: string;
  };
  readonly hooks?: readonly string[];
  readonly pronouns?: string;
  /** The `oracle.rolled` events this character was built on (A41). */
  readonly groundedIn?: readonly string[];
}

export function useCreateLaunchCharacter(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (input: AcceptCrewMemberInput) =>
      apiPost<CreateCharacterResponse>(`/campaigns/${campaignId}/launch/crew`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Revise an accepted crew member (6.0d).
 *
 * `PUT`, because the revision replaces the character rather than adding to
 * them. The body never names what it supersedes: the server reads that from
 * its own projection, so a client cannot rewrite a revision's place in the
 * chain.
 */
export function useReviseLaunchCharacter(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: ({
      characterId,
      ...input
    }: AcceptCrewMemberInput & { readonly characterId: string }) =>
      apiPut<ReviseCharacterResponse>(`/campaigns/${campaignId}/launch/crew/${characterId}`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Roll one launch oracle for a field (3R.5c).
 *
 * The single-oracle roll, not a recipe: a recipe is for building a whole
 * object before the Guide interprets it, while this is the player asking one
 * table one question. The oracle it names comes from the declared character
 * recipe, so the client still cannot reach a table the rules did not declare.
 */
export function useRollLaunchOracle(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (oracleId: string) =>
      apiPost<RollLaunchOracleResponse>(`/campaigns/${campaignId}/launch/oracle-rolls`, {
        commandId: crypto.randomUUID(),
        oracleId,
      }),
    onSuccess: invalidate,
  });
}

/** Remove a crew member before launch (6.0d). Append-only: the reason is required. */
export function useRemoveLaunchCharacter(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (input: { readonly characterId: string; readonly reason: string }) =>
      apiDelete<RemoveCharacterResponse>(
        `/campaigns/${campaignId}/launch/crew/${input.characterId}`,
        { commandId: crypto.randomUUID(), reason: input.reason },
      ),
    onSuccess: invalidate,
  });
}

/**
 * Ask the Guide for a whole crew member (6.3, D-185, D-186).
 *
 * Two commands, in this order: the declared character recipe is rolled first,
 * and its event ids ground the proposal. The rolls are the player's either
 * way — if the provider is unavailable the dice are still on the table, which
 * is the point of rolling them separately (A42).
 *
 * An outage is an answer, not a thrown error: the response comes back
 * `ok: false` with a reason the panel shows, and every manual path stays
 * exactly as usable as it was.
 */
export function useProposeCrewMember(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      readonly targetId: string;
      readonly concept: string;
      readonly fields?: readonly string[];
    }): Promise<{
      readonly commandId: string;
      readonly groundedIn: readonly string[];
      readonly response: ProposeCharacterResponse;
    }> => {
      const rolled = await apiPost<RollLaunchRecipeResponse>(
        `/campaigns/${campaignId}/launch/recipe-rolls`,
        { commandId: crypto.randomUUID(), selector: { kind: 'character' } },
      );
      const groundedIn = rolled.results.map((result) => result.eventId);
      const commandId = crypto.randomUUID();
      const response = await apiPost<ProposeCharacterResponse>(
        `/campaigns/${campaignId}/character-proposals`,
        {
          commandId,
          concept: input.concept,
          targetId: input.targetId,
          groundedIn,
          ...(input.fields === undefined ? {} : { fields: input.fields }),
        },
      );
      return { commandId, groundedIn, response };
    },
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}
