import { ApiError } from '../api/http.js';
import { useCampaignState } from '../api/campaigns.js';

import { PlayLayout } from './PlayLayout.js';
import { TopBar } from './TopBar.js';
import { SceneHeader } from './SceneHeader.js';
import { NarrativeLog } from './NarrativeLog.js';
import { PressureRail } from './PressureRail.js';
import { Composer } from './Composer.js';
import { NotFoundScreen } from './NotFoundScreen.js';
import { CrewRail } from './crew/CrewRail.js';
import { CharacterDrawer } from './crew/CharacterDrawer.js';
import { toCrewCard } from './crew/crew.js';
import { PlayUiProvider, useDrawer, useDrawerActions } from './play-ui.js';

/**
 * `/campaigns/:id` — the play screen (task 5.1, 5.2). The campaign's home
 * (D-100): opening a campaign lands here.
 *
 * Three states, not one: an unknown campaign (404) gets its own screen; a
 * still-loading campaign gets the *real* layout with placeholder zones,
 * not a spinner page, since the shell itself is what answers "where am I"
 * (§8's stall test); anything else is the layout bound to real data.
 */
export function PlayScreen({ campaignId }: { readonly campaignId: string }) {
  return (
    <PlayUiProvider>
      <PlayScreenContent campaignId={campaignId} />
    </PlayUiProvider>
  );
}

function PlayScreenContent({ campaignId }: { readonly campaignId: string }) {
  const header = useCampaignState(campaignId, (state) => ({
    name: state.campaign?.name,
    sessionNumber: state.session?.number,
  }));
  const crew = useCampaignState(campaignId, (state) =>
    Object.values(state.characters).map(toCrewCard),
  );
  const drawer = useDrawer();
  const { openCharacterDrawer, closeDrawer } = useDrawerActions();

  if (header.error instanceof ApiError && header.error.status === 404) {
    return <NotFoundScreen message={`No campaign found with id ${campaignId}.`} />;
  }

  const connected = !header.isError;
  const campaignName = header.data?.name ?? (header.isLoading ? 'Loading…' : 'Unknown campaign');

  return (
    <>
      <PlayLayout
        top={
          <TopBar
            campaignName={campaignName}
            sessionNumber={header.data?.sessionNumber}
            connected={connected}
          />
        }
        left={<CrewRail crew={crew.data ?? []} onOpen={openCharacterDrawer} />}
        sceneHeader={<SceneHeader />}
        log={<NarrativeLog campaignId={campaignId} />}
        right={<PressureRail />}
        composer={<Composer />}
      />
      {drawer?.kind === 'character' && (
        <CharacterDrawer
          campaignId={campaignId}
          characterId={drawer.characterId}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}
