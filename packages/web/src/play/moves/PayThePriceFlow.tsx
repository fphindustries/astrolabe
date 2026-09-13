import { STARFORGED, type CharacterId, type MoveId } from '@astrolabe/rules';
import type { CommandId, ResolvePayThePriceResponse } from '@astrolabe/shared';

import { useResolvePayThePrice } from '../../api/moves.js';

import styles from './PayThePriceFlow.module.css';

/**
 * Task 6.8, D-08: the method picker, with the table roll highlighted as
 * the default among the three options.
 */
export function PayThePricePicker({
  campaignId,
  actorCharacterId,
  chainedFromCommandId,
  onResolved,
  onCancel,
}: {
  readonly campaignId: string;
  readonly actorCharacterId: CharacterId;
  readonly chainedFromCommandId?: CommandId;
  readonly onResolved: (response: ResolvePayThePriceResponse, commandId: CommandId) => void;
  readonly onCancel: () => void;
}) {
  const resolve = useResolvePayThePrice(campaignId);

  async function pick(optionId: 'obvious' | 'oracle' | 'table') {
    const { response, commandId } = await resolve.mutateAsync({
      actorCharacterId,
      optionId,
      ...(chainedFromCommandId !== undefined ? { chainedFromCommandId } : {}),
    });
    onResolved(response, commandId);
  }

  return (
    <div className={styles.picker}>
      <p className={styles.prompt}>Pay the Price. Choose one.</p>
      <button
        type="button"
        className={styles.highlighted}
        disabled={resolve.isPending}
        onClick={() => void pick('table')}
      >
        Roll on the table
      </button>
      <button type="button" disabled={resolve.isPending} onClick={() => void pick('oracle')}>
        Ask the Oracle for inspiration
      </button>
      <button type="button" disabled={resolve.isPending} onClick={() => void pick('obvious')}>
        Make the most obvious negative outcome happen
      </button>
      <button type="button" className={styles.cancel} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** The table roll's result (D-08's highlighted default), and — when it lands on a mapped row — a way into the chained suffer move. */
export function PayThePriceResult({
  resolved,
  commandId,
  actorCharacterId,
  onInvokeChain,
  onDone,
}: {
  readonly resolved: ResolvePayThePriceResponse;
  readonly commandId: CommandId;
  readonly actorCharacterId: CharacterId;
  readonly onInvokeChain: (
    moveId: MoveId,
    actorCharacterId: CharacterId,
    chainedFromCommandId: CommandId,
  ) => void;
  readonly onDone: () => void;
}) {
  const targetMove =
    resolved.chain !== undefined
      ? STARFORGED.moves.find((m) => m.id === resolved.chain?.toMoveId)
      : undefined;

  return (
    <div className={styles.result}>
      {resolved.oracle !== undefined && (
        <p className={styles.oracleChip}>
          {resolved.oracle.roll}: {resolved.oracle.rowText}
        </p>
      )}
      {resolved.chain !== undefined && (
        <button
          type="button"
          className={styles.chainButton}
          onClick={() => onInvokeChain(resolved.chain?.toMoveId as MoveId, actorCharacterId, commandId)}
        >
          {targetMove?.name ?? resolved.chain.toMoveId} →
        </button>
      )}
      <button type="button" className={styles.done} onClick={onDone}>
        Done
      </button>
    </div>
  );
}
