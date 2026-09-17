import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  ActivateLaunchResponse,
  CampaignSettings,
  DecideLaunchTruthRequestBody,
  DecideLaunchTruthResponse,
  LaunchDraftFor,
  LaunchSection,
  LaunchWorkspaceResponse,
  ProposeTruthResponse,
  SaveLaunchDraftResponse,
  SetLaunchFoundationResponse,
} from '@astrolabe/shared';
import type { OracleId } from '@astrolabe/rules';

import { apiGet, apiPost, apiPut } from './http.js';
import { campaignKeys, useInvalidateCampaign } from './campaigns.js';

/**
 * The Campaign Launch workspace and its commands (group 4).
 *
 * One read serves the whole workspace: `GET /launch` returns the projected
 * facts and the server's readiness beside them (D-176), so every screen in the
 * workspace — the dashboard, a section, the review — subscribes to the same
 * query and none of them derives a status of its own.
 */

export function useLaunchWorkspace(campaignId: string) {
  return useQuery({
    queryKey: campaignKeys.launch(campaignId),
    queryFn: () => apiGet<LaunchWorkspaceResponse>(`/campaigns/${campaignId}/launch`),
  });
}

/**
 * **Save and continue** (D-161): durable, and deliberately not canon.
 *
 * `PUT`, because a section's snapshot replaces the one before it rather than
 * adding to it. It does not clear the section's blockers — a draft is not an
 * accepted fact — which is why the screen says so beside the button.
 */
export function useSaveLaunchDraft<S extends LaunchSection>(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (draft: { section: S; snapshot: LaunchDraftFor<S> }) =>
      apiPut<SaveLaunchDraftResponse>(`/campaigns/${campaignId}/launch/drafts`, {
        commandId: crypto.randomUUID(),
        draft,
      }),
    onSuccess: invalidate,
  });
}

/** The canonical foundation fact. The server refuses a blank premise (D-181). */
export function useSetFoundation(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (input: { premise: string; settings: CampaignSettings }) =>
      apiPost<SetLaunchFoundationResponse>(`/campaigns/${campaignId}/launch/foundation`, {
        commandId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Activation (A38, A40). One way, and the server revalidates readiness inside
 * its own write transaction, so a 422 here means the workspace on screen is out
 * of date rather than that the reader did something wrong.
 *
 * The `commandId` is the caller's, minted once when the confirmation opens, so
 * a second press of Launch is the same command rather than a second one.
 */
export function useActivateLaunch(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (commandId: string) =>
      apiPost<ActivateLaunchResponse>(`/campaigns/${campaignId}/launch/activate`, { commandId }),
    onSuccess: invalidate,
  });
}

/**
 * Decide one truth (A24, A25, A26).
 *
 * Per truth rather than per section: each of the four paths is its own
 * accepted fact the moment the player takes it, and a second decision on the
 * same truth is a revision the server records with its predecessor (A26).
 *
 * `proposalEventId` travels with the body when the decision accepts a Guide
 * recommendation, so the server can record whose answer it is.
 */
export function useDecideTruth(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (body: Omit<DecideLaunchTruthRequestBody, 'commandId'>) =>
      apiPost<DecideLaunchTruthResponse>(`/campaigns/${campaignId}/launch/truths`, {
        commandId: crypto.randomUUID(),
        ...body,
      }),
    onSuccess: invalidate,
  });
}

/**
 * Ask the Guide about one truth (5.3, A42).
 *
 * The response is an outcome, not an exception: a provider that is missing or
 * unavailable comes back `ok: false` with a reason the panel shows, and every
 * other path to deciding the truth stays exactly as usable as it was.
 */
export function useProposeTruth(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (truthId: OracleId) =>
      apiPost<ProposeTruthResponse>(`/campaigns/${campaignId}/truth-proposals`, {
        commandId: crypto.randomUUID(),
        truthId,
      }),
    onSuccess: invalidate,
  });
}
