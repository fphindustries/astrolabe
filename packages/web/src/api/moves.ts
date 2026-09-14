import { useMutation } from '@tanstack/react-query';
import type { CharacterId, MoveId } from '@astrolabe/rules';
import type {
  BurnMomentumResponse,
  CommandId,
  EventId,
  InvokeMoveResponse,
  ResolvePayThePriceResponse,
  VoidEventResponse,
  VoidPreviewResult,
} from '@astrolabe/shared';

import { useInvalidateCampaign } from './campaigns.js';
import { apiGet, apiPost } from './http.js';

/**
 * The move flow (task 6.x). Every mutation follows `useCreateCharacter`'s
 * shape exactly: a client-minted `commandId` per call (the idempotency key
 * section 2's store expects), and invalidate campaign state + log on
 * success so the crew rail, pressure rail and narrative log pick up
 * whatever the command just wrote.
 */

export interface InvokeMoveInput {
  readonly moveId: MoveId;
  readonly actorCharacterId: CharacterId;
  readonly aidingAllyId?: CharacterId;
  readonly using?:
    | { readonly using: 'stat'; readonly stat: 'edge' | 'heart' | 'iron' | 'shadow' | 'wits' }
    | { readonly using: 'condition_meter'; readonly meter: 'health' | 'spirit' | 'supply' };
  readonly adds: readonly { readonly amount: number; readonly label: string }[];
  readonly actionText?: string;
  readonly preRollAmount?: number;
  /** D-130: the Guide's proposal the amount was committed against. */
  readonly proposalEventId?: EventId;
  readonly chainedFromCommandId?: CommandId;
}

export interface InvokedMove {
  readonly response: InvokeMoveResponse;
  /** The commandId this call minted — what a later `chainedFromCommandId` follows from. */
  readonly commandId: CommandId;
}

export function useInvokeMove(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: InvokeMoveInput): Promise<InvokedMove> => {
      const commandId = crypto.randomUUID() as CommandId;
      return apiPost<InvokeMoveResponse>(`/campaigns/${campaignId}/moves`, {
        commandId,
        ...input,
      }).then((response) => ({ response, commandId }));
    },
    onSuccess: invalidate,
  });
}

export interface ApplyMoveChoiceInput {
  readonly rollEventId: string;
  readonly choiceId: string;
  readonly optionIds: readonly string[];
}

export function useApplyMoveChoice(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: ApplyMoveChoiceInput) =>
      apiPost<Record<string, never>>(`/campaigns/${campaignId}/moves/choice`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

export function useBurnMomentum(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (rollEventId: string) =>
      apiPost<BurnMomentumResponse>(`/campaigns/${campaignId}/moves/burn`, {
        commandId: crypto.randomUUID(),
        rollEventId,
      }),
    onSuccess: invalidate,
  });
}

export interface ResolvePayThePriceInput {
  readonly actorCharacterId: CharacterId;
  readonly optionId: 'obvious' | 'oracle' | 'table';
  readonly chainedFromCommandId?: CommandId;
}

export function useResolvePayThePrice(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: (input: ResolvePayThePriceInput) => {
      const commandId = crypto.randomUUID() as CommandId;
      return apiPost<ResolvePayThePriceResponse>(`/campaigns/${campaignId}/pay-the-price`, {
        commandId,
        ...input,
      }).then((response) => ({ response, commandId }));
    },
    onSuccess: invalidate,
  });
}

/** Void-and-redo (task 6.10). `previewVoid` is a plain query the caller fires on demand, not a `useQuery` — the preview is asked for once, right before showing a confirm control, not kept live. */
export function fetchVoidPreview(campaignId: string, eventId: string) {
  return apiGet<VoidPreviewResult>(`/campaigns/${campaignId}/events/${eventId}/void-preview`);
}

export function useVoidEvent(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);
  return useMutation({
    mutationFn: ({ eventId, reason }: { readonly eventId: string; readonly reason: string }) =>
      apiPost<VoidEventResponse>(`/campaigns/${campaignId}/events/${eventId}/void`, {
        commandId: crypto.randomUUID(),
        reason,
      }),
    onSuccess: invalidate,
  });
}
