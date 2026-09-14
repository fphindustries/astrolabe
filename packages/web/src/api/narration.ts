import { useMutation, useQuery } from '@tanstack/react-query';
import type { CharacterId, MoveId } from '@astrolabe/rules';
import type {
  AiStatusResponse,
  CommandId,
  NarrationFrame,
  OverrideRequestBody,
  OverrideResponse,
  ProposeAmountResponse,
} from '@astrolabe/shared';

import { useInvalidateCampaign } from './campaigns.js';
import { ApiError, apiGet, apiPost } from './http.js';
import { FrameSplitter } from './ndjson.js';

/**
 * Group 7's HTTP layer: the streamed narration routes (D-111), the AI's
 * availability (D-116), proposed amounts (D-118) and manual overrides
 * (D-117).
 */

export const aiKeys = {
  status: ['ai', 'status'] as const,
};

/** Task 7.11: polled lightly, and refetched explicitly after every AI call. */
export function useAiStatus() {
  return useQuery({
    queryKey: aiKeys.status,
    queryFn: () => apiGet<AiStatusResponse>('/ai/status'),
    staleTime: 30_000,
  });
}

/**
 * POST and read an NDJSON response frame by frame. A refusal (422, or any
 * non-2xx) throws `ApiError` before any frame is delivered; once the
 * stream is open, every outcome — including a provider failure — arrives
 * as a frame.
 */
export async function streamNarration(
  path: string,
  body: unknown,
  onFrame: (frame: NarrationFrame) => void,
): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { accept: 'application/x-ndjson', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok || response.body === null) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = undefined;
    }
    throw new ApiError(response.status, errorBody);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const splitter = new FrameSplitter();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    splitter.push(value).forEach(onFrame);
  }
  splitter.flush().forEach(onFrame);
}

export function narrateBeatPath(campaignId: string) {
  return `/campaigns/${campaignId}/narrations`;
}

export function sceneFramePath(campaignId: string) {
  return `/campaigns/${campaignId}/scene-frames`;
}

export function worldPassPath(campaignId: string) {
  return `/campaigns/${campaignId}/world-passes`;
}

export function correctNarrationPath(campaignId: string, eventId: string) {
  return `/campaigns/${campaignId}/narrations/${eventId}/corrections`;
}

export interface ProposeAmountInput {
  readonly moveId: MoveId;
  readonly actorCharacterId: CharacterId;
  readonly chainedFromCommandId?: CommandId;
}

export function useProposeAmount(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: ProposeAmountInput) =>
      apiPost<ProposeAmountResponse>(`/campaigns/${campaignId}/amount-proposals`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

export function useOverride(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: Omit<OverrideRequestBody, 'commandId'>) =>
      apiPost<OverrideResponse>(`/campaigns/${campaignId}/overrides`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}
