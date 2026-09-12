import { useMutation } from '@tanstack/react-query';
import type { CharacterDraft } from '@astrolabe/rules';
import type { CreateCharacterResponse } from '@astrolabe/shared';

import { useInvalidateCampaign } from './campaigns.js';
import { apiPost } from './http.js';

/**
 * Character creation (task 3.2), the first command endpoint the client
 * writes through. `commandId` is minted here, client-side, per command —
 * it's the idempotency key section 2's store expects, not something the
 * server can generate on the caller's behalf.
 */

export interface CreateCharacterInput {
  readonly draft: CharacterDraft;
  readonly backgroundVow?: { readonly title: string; readonly rank: string };
}

export function useCreateCharacter(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (input: CreateCharacterInput) =>
      apiPost<CreateCharacterResponse>(`/campaigns/${campaignId}/characters`, {
        commandId: crypto.randomUUID(),
        draft: input.draft,
        ...(input.backgroundVow !== undefined ? { backgroundVow: input.backgroundVow } : {}),
      }),
    onSuccess: invalidate,
  });
}
