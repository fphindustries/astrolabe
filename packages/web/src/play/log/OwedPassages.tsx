import { STARFORGED } from '@astrolabe/rules';

import { useCampaignState, useOwedPassages } from '../../api/campaigns.js';
import { ComplicationPrompt } from '../moves/ComplicationPrompt.js';
import { useMoveFlow } from '../moves/move-flow.js';
import { useNarrationStream } from '../narration/narration-stream.js';

import styles from './OwedPassages.module.css';

/**
 * Resuming a campaign (9.5, D-150): the open session's move chains that no
 * passage covers. The narration queue lives in the browser, so a reload
 * between a move and its passage would otherwise strand the move unnarrated.
 * Each gets **Narrate**, or first its complication when one is still owed.
 *
 * Shown only while no move flow is open and nothing is being narrated: a
 * chain the player is still resolving, or one already queued, isn't owed.
 */
export function OwedPassages({ campaignId }: { readonly campaignId: string }) {
  const owed = useOwedPassages(campaignId);
  const callsigns = useCampaignState(campaignId, (state) =>
    Object.fromEntries(Object.values(state.characters).map((c) => [c.id, c.callsign])),
  );
  const flow = useMoveFlow();
  const narration = useNarrationStream();

  if (
    flow.step !== 'idle' ||
    narration.pending !== null ||
    narration.paused ||
    (owed.data ?? []).length === 0
  ) {
    return null;
  }

  return (
    <div className={styles.owed}>
      {(owed.data ?? []).map((chain) => {
        const move = STARFORGED.moves.find((m) => m.id === chain.moveId)?.name ?? chain.moveId;
        const who = callsigns.data?.[chain.actorCharacterId] ?? 'A crew member';
        return (
          <div key={chain.rootCommandId} className={styles.chain}>
            <p className={styles.line}>
              Not yet narrated: {who}, {move}
              {chain.actionText !== undefined ? ` — “${chain.actionText}”` : ''}
            </p>
            {chain.complication !== undefined ? (
              <ComplicationPrompt
                campaignId={campaignId}
                moveCommandId={chain.complication.moveCommandId}
                clause={chain.complication.clause}
                onSet={() => {
                  // The state refetch drops the complication from this chain, and Narrate appears.
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.narrate}
                onClick={() => narration.narrateAfter(chain.rootCommandId)}
              >
                Narrate
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
