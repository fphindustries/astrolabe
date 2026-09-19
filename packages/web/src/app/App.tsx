import { QueryClientProvider } from '@tanstack/react-query';

import { CampaignHomeScreen } from '../campaigns/CampaignHomeScreen.js';
import { CampaignListScreen } from '../campaigns/CampaignListScreen.js';
import { NewCampaignScreen } from '../campaigns/NewCampaignScreen.js';
import { NotFoundScreen } from '../play/NotFoundScreen.js';
import { PlayScreen } from '../play/PlayScreen.js';
import { ErrorBoundary } from '../ui/ErrorBoundary.js';

import { queryClient } from './query-client.js';
import { useRoute } from './routes.js';

/**
 * The app root: providers, then the route switch.
 *
 * `/campaigns/:id` is a dispatcher rather than a screen (task 4.4): a campaign
 * still in Campaign Launch opens on its workspace, one in play opens on the
 * play screen, and the server decides which. The three launch views share that
 * dispatcher so the check happens once, in one place.
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
    case 'campaign-new':
      return <NewCampaignScreen />;
    case 'campaign-home':
      // "Open this campaign" — so a campaign past launch opens in play.
      return <CampaignHomeScreen campaignId={route.campaignId} view={{ kind: 'home' }} />;
    case 'launch-overview':
      return <CampaignHomeScreen campaignId={route.campaignId} view={{ kind: 'overview' }} />;
    case 'launch-review':
      return <CampaignHomeScreen campaignId={route.campaignId} view={{ kind: 'review' }} />;
    case 'launch-section':
      return (
        <CampaignHomeScreen
          campaignId={route.campaignId}
          view={{ kind: 'section', section: route.section }}
        />
      );
    case 'play':
      return <PlayScreen campaignId={route.campaignId} />;
    case 'not-found':
      return <NotFoundScreen message={`No route matches ${route.pathname}.`} />;
  }
}
