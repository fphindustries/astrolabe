import { QueryClientProvider } from '@tanstack/react-query';

import { CampaignListScreen } from '../campaigns/CampaignListScreen.js';
import { NotFoundScreen } from '../play/NotFoundScreen.js';
import { PlayScreen } from '../play/PlayScreen.js';
import { ErrorBoundary } from '../ui/ErrorBoundary.js';

import { queryClient } from './query-client.js';
import { useRoute } from './routes.js';

/**
 * The app root: providers, then the route switch. Campaign setup
 * (`/campaigns/new`, group 4) and character creation
 * (`/campaigns/:id/characters/new`, tasks 3.2/3.4) are routed but not yet
 * built — they render a pointer to their task rather than 404ing, since
 * the route itself is real (D-100).
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Routed />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

function Routed() {
  const route = useRoute();

  switch (route.name) {
    case 'campaign-list':
      return <CampaignListScreen />;
    case 'play':
      return <PlayScreen campaignId={route.campaignId} />;
    case 'campaign-new':
      return <NotFoundScreen message="Campaign setup lands with group 4." />;
    case 'character-new':
      return <NotFoundScreen message="Character creation lands with tasks 3.2/3.4." />;
    case 'not-found':
      return <NotFoundScreen message={`No route matches ${route.pathname}.`} />;
  }
}
