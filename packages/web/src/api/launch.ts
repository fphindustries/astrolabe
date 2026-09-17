import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  ActivateLaunchResponse,
  CampaignSettings,
  LaunchDraftFor,
  LaunchWorkspaceResponse,
  SaveLaunchDraftResponse,
  SetLaunchFoundationResponse,
} from '@astrolabe/shared';

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
export function useSaveLaunchDraft(campaignId: string) {
  const invalidate = useInvalidateCampaign(campaignId);

  return useMutation({
    mutationFn: (draft: { section: 'foundation'; snapshot: LaunchDraftFor<'foundation'> }) =>
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
