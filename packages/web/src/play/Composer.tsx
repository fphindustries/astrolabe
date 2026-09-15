import type { CharacterId, MoveId } from '@astrolabe/rules';
import type { CommandId } from '@astrolabe/shared';
import { useState } from 'react';

import { useCampaignState } from '../api/campaigns.js';

import type { CrewCardView } from './crew/crew.js';
import { MoveComposer } from './moves/MoveComposer.js';
import { useMoveFlow, useMoveFlowActions } from './moves/move-flow.js';
import { useNarrationStream } from './narration/narration-stream.js';
import { ActionPrompt } from './moves/ActionPrompt.js';
import { PayThePricePicker, PayThePriceResult } from './moves/PayThePriceFlow.js';
import { ResultCard } from './moves/ResultCard.js';
import { WhatNow } from './moves/WhatNow.js';
import { BeginSession } from './session/BeginSession.js';
import { EndSession } from './session/EndSession.js';
import { toSessionView } from './session/session.js';
import styles from './Composer.module.css';

/**
 * §8's action composer (group 6): the acting-character control (D-98), the
 * relevant-moves panel (6.1), and whichever move-flow step is currently in
 * progress. Capped at `--composer-max` so a growing panel squeezes the log
 * rather than the page (D-40).
 *
 * Finishing a flow ("Done") is what asks the Guide to narrate it (D-110):
 * the flow's own commandId names the chain. While the Guide is unavailable
 * the composer is replaced by the pause banner (D-116) — state is intact,
 * but play does not go on without its narrator. While no session is open it
 * is replaced by Begin Session (D-146).
 */
export function Composer({
  campaignId,
  crew,
  actingCharacterId,
  onSetActing,
  onOpenMovesDrawer,
}: {
  readonly campaignId: string;
  readonly crew: readonly CrewCardView[];
  readonly actingCharacterId: CharacterId | undefined;
  readonly onSetActing: (characterId: CharacterId) => void;
  readonly onOpenMovesDrawer: (moveId?: MoveId) => void;
}) {
  const flow = useMoveFlow();
  const { selectMove, openPayThePrice, payThePriceResolved, reset } = useMoveFlowActions();
  const narration = useNarrationStream();
  const session = useCampaignState(campaignId, toSessionView);
  // D-148: a suggestion the composer can't play still carries its words into
  // the prompt; bumping `version` remounts the prompt with them.
  const [draft, setDraft] = useState({ text: '', version: 0 });
  // D-149: End a Session replaces the composer while it is under review.
  const [ending, setEnding] = useState(false);

  if (crew.length === 0) {
    return <div className={styles.composer}>No one to act yet.</div>;
  }

  // D-146: play happens inside a session. Beginning one needs no Guide, so
  // it comes ahead of the pause banner.
  if (session.data !== undefined && session.data.kind !== 'open') {
    return (
      <div className={styles.composer}>
        <BeginSession campaignId={campaignId} view={session.data} />
      </div>
    );
  }

  if (narration.paused && flow.step === 'idle') {
    return (
      <div className={styles.composer} role="alert">
        <div className={styles.paused}>
          <span className={styles.pausedTitle}>Guide unavailable — session paused</span>
          <span className={styles.pausedReason}>
            {narration.pauseReason ?? 'The Guide cannot be reached.'} Your campaign is saved as it
            stands.
          </span>
          <button
            type="button"
            className={styles.retry}
            onClick={narration.retry}
            disabled={narration.pending !== null}
          >
            {narration.pending !== null ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (ending && flow.step === 'idle') {
    return (
      <div className={styles.composer}>
        <EndSession campaignId={campaignId} onCancel={() => setEnding(false)} />
      </div>
    );
  }

  const finish = (commandId: CommandId) => {
    narration.narrateAfter(commandId);
    reset();
  };
  const actor = actingCharacterId ?? crew[0]?.characterId;

  return (
    <div className={styles.composer}>
      {narration.notice !== undefined && (
        <div className={styles.notice}>
          {narration.notice}
          <button type="button" className={styles.dismiss} onClick={narration.dismissNotice}>
            Dismiss
          </button>
        </div>
      )}
      <div className={styles.actingRow}>
        <span className={styles.actingLabel}>Acting as</span>
        <select
          className={styles.actingSelect}
          value={actor}
          onChange={(event) => onSetActing(event.target.value as CharacterId)}
        >
          {crew.map((c) => (
            <option key={c.characterId} value={c.characterId}>
              {c.callsign}
            </option>
          ))}
        </select>
        {flow.step === 'idle' && (
          <button type="button" className={styles.endSession} onClick={() => setEnding(true)}>
            End session
          </button>
        )}
      </div>

      {flow.step === 'idle' && actor !== undefined && (
        <WhatNow
          campaignId={campaignId}
          crew={crew}
          onUse={(suggestion, playable) => {
            const characterId = suggestion.characterId as CharacterId;
            onSetActing(characterId);
            if (playable && suggestion.moveId !== null) {
              selectMove(suggestion.moveId as MoveId, characterId, undefined, {
                actionText: suggestion.actionText,
              });
              return;
            }
            setDraft((d) => ({ text: suggestion.actionText, version: d.version + 1 }));
            if (suggestion.moveId !== null) {
              onOpenMovesDrawer(suggestion.moveId as MoveId);
            }
          }}
        />
      )}

      {flow.step === 'idle' && actor !== undefined && (
        // Keyed by the actor: a suggestion answers for one character (D-135).
        <ActionPrompt
          key={`${actor}:${draft.version}`}
          campaignId={campaignId}
          actorCharacterId={actor}
          initialText={draft.text}
          onSelect={(moveId: MoveId, prefill) => selectMove(moveId, actor, undefined, prefill)}
          onOpenFullList={() => onOpenMovesDrawer()}
        />
      )}

      {flow.step === 'composing' && (
        <MoveComposer
          campaignId={campaignId}
          moveId={flow.moveId}
          actorCharacterId={flow.actorCharacterId}
          crew={crew}
          {...(flow.chainedFromCommandId !== undefined
            ? { chainedFromCommandId: flow.chainedFromCommandId }
            : {})}
          {...(flow.prefill !== undefined ? { prefill: flow.prefill } : {})}
          onResolved={() => {
            /* move-flow already transitions to 'result' via moveResolved */
          }}
          onCancel={reset}
        />
      )}

      {flow.step === 'result' && (
        <ResultCard
          campaignId={campaignId}
          crew={crew}
          moveId={flow.moveId}
          {...(flow.aidingAllyId !== undefined ? { aidingAllyId: flow.aidingAllyId } : {})}
          invoked={flow.invoked}
          commandId={flow.commandId}
          checkTrigger={flow.checkTrigger === true}
          onOpenPayThePrice={(chainedFromCommandId: CommandId) =>
            openPayThePrice(flow.actorCharacterId, chainedFromCommandId)
          }
          onDone={() => finish(flow.commandId)}
        />
      )}

      {flow.step === 'pay-the-price' && (
        <PayThePricePicker
          campaignId={campaignId}
          actorCharacterId={flow.actorCharacterId}
          {...(flow.chainedFromCommandId !== undefined
            ? { chainedFromCommandId: flow.chainedFromCommandId }
            : {})}
          onResolved={(response, commandId) =>
            payThePriceResolved(flow.actorCharacterId, response, commandId)
          }
          onCancel={reset}
        />
      )}

      {flow.step === 'pay-the-price-result' && (
        <PayThePriceResult
          resolved={flow.resolved}
          commandId={flow.commandId}
          actorCharacterId={flow.actorCharacterId}
          onInvokeChain={(moveId, actorCharacterId, chainedFromCommandId) =>
            selectMove(moveId, actorCharacterId, chainedFromCommandId)
          }
          onDone={() => finish(flow.commandId)}
        />
      )}
    </div>
  );
}
