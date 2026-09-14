import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CharacterDraft } from '@astrolabe/rules';
import type { CreateCharacterResponse, ProposeCharacterResponse } from '@astrolabe/shared';

import { useInvalidateCampaign } from './campaigns.js';
import { apiPost } from './http.js';
import { aiKeys } from './narration.js';

/**
 * Character creation (task 3.2), the first command endpoint the client
 * writes through. `commandId` is minted here, client-side, per command —
 * it's the idempotency key section 2's store expects, not something the
 * server can generate on the caller's behalf.
 */

export interface CreateCharacterInput {
  readonly draft: CharacterDraft;
  readonly backgroundVow?: { readonly title: string; readonly rank: string };
  /** D-124. */
  readonly hooks?: readonly string[];
  /** D-124: the proposal this character was accepted from, if any. */
  readonly proposalCommandId?: string;
}

export function useCreateCharacter(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (input: CreateCharacterInput) =>
      apiPost<CreateCharacterResponse>(`/campaigns/${campaignId}/characters`, {
        commandId: crypto.randomUUID(),
        draft: input.draft,
        ...(input.backgroundVow !== undefined ? { backgroundVow: input.backgroundVow } : {}),
        ...(input.hooks !== undefined && input.hooks.length > 0 ? { hooks: input.hooks } : {}),
        ...(input.proposalCommandId !== undefined
          ? { proposalCommandId: input.proposalCommandId }
          : {}),
      }),
    onSuccess: invalidate,
  });
}

/** The answer, plus the command id accepting it must name. */
export interface ProposedCharacter {
  readonly commandId: string;
  readonly response: ProposeCharacterResponse;
}

/** Task 3.3 / D-124: ask the Guide for a build. An outage is an answer, not a thrown error. */
export function useProposeCharacter(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (concept: string): Promise<ProposedCharacter> => {
      const commandId = crypto.randomUUID();
      const response = await apiPost<ProposeCharacterResponse>(
        `/campaigns/${campaignId}/character-proposals`,
        { commandId, concept },
      );
      return { commandId, response };
    },
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}
