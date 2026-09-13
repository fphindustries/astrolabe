import type { CharacterId, MoveId } from '@astrolabe/rules';
import type { CommandId } from '@astrolabe/shared';

import type { CrewCardView } from './crew/crew.js';
import { MoveComposer } from './moves/MoveComposer.js';
import { useMoveFlow, useMoveFlowActions } from './moves/move-flow.js';
import { PayThePricePicker, PayThePriceResult } from './moves/PayThePriceFlow.js';
import { RelevantMovesPanel } from './moves/RelevantMovesPanel.js';
import { ResultCard } from './moves/ResultCard.js';
import styles from './Composer.module.css';

/**
 * §8's action composer (group 6): the acting-character control (D-98), the
 * relevant-moves panel (6.1), and whichever move-flow step is currently in
 * progress. Capped at `--composer-max` so a growing panel squeezes the log
 * rather than the page (D-40).
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
  readonly onOpenMovesDrawer: () => void;
}) {
  const flow = useMoveFlow();
  const { selectMove, openPayThePrice, payThePriceResolved, reset } = useMoveFlowActions();

  if (crew.length === 0) {
    return <div className={styles.composer}>No one to act yet.</div>;
  }
  const actor = actingCharacterId ?? crew[0]?.characterId;

  return (
    <div className={styles.composer}>
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
      </div>

      {flow.step === 'idle' && actor !== undefined && (
        <RelevantMovesPanel
          onSelect={(moveId: MoveId) => selectMove(moveId, actor)}
          onOpenFullList={onOpenMovesDrawer}
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
          onOpenPayThePrice={(chainedFromCommandId: CommandId) =>
            openPayThePrice(flow.actorCharacterId, chainedFromCommandId)
          }
          onDone={reset}
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
          onDone={reset}
        />
      )}
    </div>
  );
}
