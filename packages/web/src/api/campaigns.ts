import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CampaignListResponse,
  CampaignState,
  CampaignStateResponse,
  NarrativeLogResponse,
} from '@astrolabe/shared';

import { apiGet } from './http.js';

/**
 * Campaign queries, mirroring the two read models (task 5.0) rather than
 * merging them: `state` is bounded and replaced whole, `log` is paged.
 * `select` is threaded through `useCampaignState` so a component can
 * subscribe to a slice of state — a crew card doesn't need to re-render
 * because a clock ticked.
 */

export const campaignKeys = {
  all: ['campaigns'] as const,
  list: () => [...campaignKeys.all, 'list'] as const,
  state: (campaignId: string) => [...campaignKeys.all, campaignId, 'state'] as const,
  log: (campaignId: string) => [...campaignKeys.all, campaignId, 'log'] as const,
};

export function useCampaignList() {
  return useQuery({
    queryKey: campaignKeys.list(),
    queryFn: () => apiGet<CampaignListResponse>('/campaigns'),
  });
}

export function useCampaignState<T = CampaignState>(
  campaignId: string,
  select?: (state: CampaignState) => T,
) {
  return useQuery({
    queryKey: campaignKeys.state(campaignId),
    queryFn: () => apiGet<CampaignStateResponse>(`/campaigns/${campaignId}/state`),
    select: (response) => (select ? select(response.state) : (response.state as T)),
  });
}

/** Invalidates a campaign's state and log — call after a command writes. */
export function useInvalidateCampaign(campaignId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: campaignKeys.state(campaignId) });
    void queryClient.invalidateQueries({ queryKey: campaignKeys.log(campaignId) });
  };
}

const LOG_PAGE_SIZE = 50;

/**
 * The narrative log, paged oldest-page-last: each fetch asks for the page
 * *before* the oldest beat already loaded, using `NarrativeLog.nextCursor`
 * as the page param — the same cursor `buildNarrativeLog` hands back, so
 * this is the one paging contract, not a second one invented on the client.
 */
export function useCampaignLog(campaignId: string) {
  return useInfiniteQuery({
    queryKey: campaignKeys.log(campaignId),
    queryFn: ({ pageParam }: { pageParam: number | undefined }) =>
      apiGet<NarrativeLogResponse>(
        `/campaigns/${campaignId}/log?limit=${LOG_PAGE_SIZE}` +
          (pageParam === undefined ? '' : `&before=${pageParam}`),
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
