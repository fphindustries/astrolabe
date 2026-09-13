import { QueryClientProvider } from '@tanstack/react-query';

import { CampaignCreationScreen } from '../campaigns/CampaignCreationScreen.js';
import { CampaignListScreen } from '../campaigns/CampaignListScreen.js';
import { CharacterCreationScreen } from '../characters/CharacterCreationScreen.js';
import { NotFoundScreen } from '../play/NotFoundScreen.js';
import { PlayScreen } from '../play/PlayScreen.js';
import { ErrorBoundary } from '../ui/ErrorBoundary.js';

import { queryClient } from './query-client.js';
import { useRoute } from './routes.js';

/**
 * The app root: providers, then the route switch. Campaign setup
 * (`/campaigns/new`, group 4) and character creation
 * (`/campaigns/:id/characters/new`, tasks 3.2/3.4) are both full-page routes
 * (D-100).
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
      return <CampaignCreationScreen />;
    case 'character-new':
      return <CharacterCreationScreen campaignId={route.campaignId} />;
    case 'not-found':
      return <NotFoundScreen message={`No route matches ${route.pathname}.`} />;
  }
}
