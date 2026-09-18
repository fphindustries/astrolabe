import { useMutation } from '@tanstack/react-query';
import type {
  CreateCharacterResponse,
  RemoveCharacterResponse,
  ReviseCharacterResponse,
  RollLaunchOracleResponse,
} from '@astrolabe/shared';

import { apiDelete, apiPost, apiPut } from './http.js';
import { useInvalidateCampaign } from './campaigns.js';

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
