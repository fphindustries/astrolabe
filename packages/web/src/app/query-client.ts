import { QueryClient } from '@tanstack/react-query';

/**
 * One client for the app. Campaign state is `staleTime: Infinity` by
 * default (see `api/campaigns.ts`): the server is the only writer, so a
 * refetch is driven by an explicit invalidation after a command, never by
 * a timer or a window refocus.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});
