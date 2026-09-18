import { useState } from 'react';

import type { CharacterId } from '@astrolabe/rules';

import { ApiError } from '../api/http.js';
import { useCampaignState } from '../api/campaigns.js';
import { useAiStatus } from '../api/narration.js';

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
import { EntityRail } from './entities/EntityRail.js';
import { EntityDrawer } from './entities/EntityDrawer.js';
import { entityCards } from './entities/entities.js';
import { TrackerDrawer } from './pressure/TrackerDrawer.js';
import { MoveDrawer } from './moves/MoveDrawer.js';
import { MoveFlowProvider } from './moves/move-flow.js';
import { NarrationStreamProvider } from './narration/narration-stream.js';
import { AssetDrawer } from './assets/AssetDrawer.js';
import { ShipCard } from '../ship/ShipCard.js';
import { shipView } from '../ship/ship-view.js';
import { PlayUiProvider, useDrawer, useDrawerActions } from './play-ui.js';
import styles from './PlayScreen.module.css';

/**
 * `/campaigns/:id` — the play screen (task 5.1, 5.2, 5.3–5.7). The
 * campaign's home (D-100): opening a campaign lands here.
 *
 * Three states, not one: an unknown campaign (404) gets its own screen; a
 * still-loading campaign gets the *real* layout with placeholder zones,
 * not a spinner page, since the shell itself is what answers "where am I"
 * (§8's stall test); anything else is the layout bound to real data.
 */
export function PlayScreen({ campaignId }: { readonly campaignId: string }) {
  return (
    <PlayUiProvider>
      <MoveFlowProvider>
        <NarrationStreamProvider campaignId={campaignId}>
          <PlayScreenContent campaignId={campaignId} />
        </NarrationStreamProvider>
      </MoveFlowProvider>
    </PlayUiProvider>
  );
}

function PlayScreenContent({ campaignId }: { readonly campaignId: string }) {
  const header = useCampaignState(campaignId, (state) => ({
    name: state.campaign?.name,
    sessionNumber: state.session?.number,
    tokens: state.session?.tokenUsage,
    campaignTokens: state.tokenUsage,
  }));
  const guide = useAiStatus();
  const crew = useCampaignState(campaignId, (state) =>
    Object.values(state.characters).map(toCrewCard),
  );
  const entities = useCampaignState(campaignId, (state) => entityCards(state.entities));
  // 7.2, D-164: the ship once, at crew level — a launched ship, or the one a
  // Milestone 1 crew was granted, which the fold keeps off each sheet (D-193).
  const ship = useCampaignState(campaignId, (state) =>
    state.launch.starship !== undefined ||
    Object.values(state.characters).some((c) => c.legacyStarshipGrant === true)
      ? shipView(state)
      : null,
  );
  const drawer = useDrawer();
  // D-98: choosing the acting character is the composer's own control, not
  // the crew card's click — that still opens the character drawer.
  const [actingCharacterId, setActingCharacterId] = useState<CharacterId | undefined>(undefined);
  // The composer acts as the first crew member until another is chosen; the card says so too.
  const acting = actingCharacterId ?? crew.data?.[0]?.characterId;
  const {
    openCharacterDrawer,
    openEntityDrawer,
    openTrackDrawer,
    openAssetDrawer,
    openMovesDrawer,
    closeDrawer,
  } = useDrawerActions();

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
            guideAvailable={guide.data?.available}
            tokens={header.data?.tokens}
            campaignTokens={header.data?.campaignTokens}
            onOpenMoves={() => openMovesDrawer()}
          />
        }
        left={
          <div className={styles.leftRail}>
            <div className={styles.crewSection}>
              <CrewRail
                crew={crew.data ?? []}
                {...(acting !== undefined ? { actingCharacterId: acting } : {})}
                onOpen={openCharacterDrawer}
              />
            </div>
            {ship.data !== null && ship.data !== undefined && (
              <div className={styles.shipSection}>
                <ShipCard view={ship.data} onOpenAsset={openAssetDrawer} />
              </div>
            )}
            <div className={styles.entitySection}>
              <EntityRail entities={entities.data ?? []} onOpen={openEntityDrawer} />
            </div>
          </div>
        }
        sceneHeader={<SceneHeader campaignId={campaignId} />}
        log={<NarrativeLog campaignId={campaignId} />}
        right={<PressureRail campaignId={campaignId} onOpenTrackerDrawer={openTrackDrawer} />}
        composer={
          <Composer
            campaignId={campaignId}
            crew={crew.data ?? []}
            actingCharacterId={actingCharacterId}
            onSetActing={setActingCharacterId}
            onOpenMovesDrawer={openMovesDrawer}
          />
        }
      />
      {drawer?.kind === 'character' && (
        <CharacterDrawer
          campaignId={campaignId}
          characterId={drawer.characterId}
          onClose={closeDrawer}
          onOpenAsset={openAssetDrawer}
        />
      )}
      {drawer?.kind === 'entity' && (
        <EntityDrawer campaignId={campaignId} entityId={drawer.entityId} onClose={closeDrawer} />
      )}
      {drawer?.kind === 'track' && (
        <TrackerDrawer campaignId={campaignId} trackKind={drawer.trackKind} onClose={closeDrawer} />
      )}
      {drawer?.kind === 'asset' && <AssetDrawer assetId={drawer.assetId} onClose={closeDrawer} />}
      {drawer?.kind === 'moves' && (
        <MoveDrawer
          key={drawer.moveId ?? 'all'}
          onClose={closeDrawer}
          {...(drawer.moveId !== undefined ? { moveId: drawer.moveId } : {})}
        />
      )}
    </>
  );
}
