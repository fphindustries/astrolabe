import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CharacterId, MoveId } from '@astrolabe/rules';
import type {
  AiStatusResponse,
  BeginSessionResponse,
  EndSessionRequestBody,
  EndSessionResponse,
  ProposeSessionSummaryResponse,
  CommandId,
  EntityId,
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

export function recapPath(campaignId: string) {
  return `/campaigns/${campaignId}/recaps`;
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

export interface BeginSessionInput {
  /** Only for a campaign's first session (D-146). */
  readonly scene?: { readonly title: string; readonly locationId?: EntityId };
}

/** D-146: Begin a Session. It commits at once; the recap is asked for after (D-147). */
export function useBeginSession(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: BeginSessionInput) =>
      apiPost<BeginSessionResponse>(`/campaigns/${campaignId}/sessions`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

/** D-149: End a Session's proposal. It changes nothing until the player commits. */
export function useProposeSessionSummary(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<ProposeSessionSummaryResponse>(`/campaigns/${campaignId}/session-summaries`, {
        commandId: crypto.randomUUID(),
      }),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}

/** D-149: the commit, edited or not. */
export function useEndSession(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: Omit<EndSessionRequestBody, 'commandId'>) =>
      apiPost<EndSessionResponse>(`/campaigns/${campaignId}/session-ends`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}
