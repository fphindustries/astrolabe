import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';

import type { CharacterId, MoveId } from '@astrolabe/rules';
import type { CommandId, InvokeMoveResponse, ResolvePayThePriceResponse } from '@astrolabe/shared';

import type { ComposerPrefill } from './suggestion.js';

/**
 * The move-resolution flow (group 6): a sibling to `play-ui.tsx`'s
 * `DrawerState`, not folded into it — a roll is a multi-step decision, not
 * an overlay choice. Kept to "which panel is showing and with what," the
 * same way `play-ui.tsx` is kept to "which drawer is open": once a step's
 * component has its data (an `InvokeMoveResponse`), the choice prompt,
 * burn offer and Aid Your Ally explanation are that component's own local
 * state, not further reducer actions — they don't change *which* panel is
 * showing.
 */

export type MoveFlowState =
  | { readonly step: 'idle' }
  | {
      readonly step: 'composing';
      readonly moveId: MoveId;
      readonly actorCharacterId: CharacterId;
      /** Set only when this invocation follows an offered/auto chain. */
      readonly chainedFromCommandId?: CommandId;
      /** D-135: typed words, and a Guide suggestion, carried into the composer. */
      readonly prefill?: ComposerPrefill;
      /** D-201: this Swear an Iron Vow swears the pending inciting vow. */
      readonly pendingVow?: true;
    }
  | {
      readonly step: 'result';
      readonly moveId: MoveId;
      readonly actorCharacterId: CharacterId;
      readonly aidingAllyId?: CharacterId;
      readonly invoked: InvokeMoveResponse;
      /** This call's own commandId — what a chain offer's follow-up call names as `chainedFromCommandId`. */
      readonly commandId: CommandId;
      /** D-136: the player typed an action the Guide didn't already judge, so its trigger is checked. */
      readonly checkTrigger?: boolean;
    }
  | {
      readonly step: 'pay-the-price';
      readonly actorCharacterId: CharacterId;
      readonly chainedFromCommandId?: CommandId;
    }
  | {
      readonly step: 'pay-the-price-result';
      readonly actorCharacterId: CharacterId;
      readonly resolved: ResolvePayThePriceResponse;
      /** This call's own commandId — what a further chain (to Endure Harm) follows from. */
      readonly commandId: CommandId;
    };

type MoveFlowAction =
  | {
      readonly type: 'select-move';
      readonly moveId: MoveId;
      readonly actorCharacterId: CharacterId;
      readonly chainedFromCommandId?: CommandId;
      readonly prefill?: ComposerPrefill;
      readonly pendingVow?: true;
    }
  | {
      readonly type: 'move-resolved';
      readonly moveId: MoveId;
      readonly actorCharacterId: CharacterId;
      readonly aidingAllyId?: CharacterId;
      readonly invoked: InvokeMoveResponse;
      readonly commandId: CommandId;
      readonly checkTrigger?: boolean;
    }
  | {
      readonly type: 'open-pay-the-price';
      readonly actorCharacterId: CharacterId;
      readonly chainedFromCommandId?: CommandId;
    }
  | {
      readonly type: 'pay-the-price-resolved';
      readonly actorCharacterId: CharacterId;
      readonly resolved: ResolvePayThePriceResponse;
      readonly commandId: CommandId;
    }
  | { readonly type: 'reset' };

function moveFlowReducer(_state: MoveFlowState, action: MoveFlowAction): MoveFlowState {
  switch (action.type) {
    case 'select-move':
      return {
        step: 'composing',
        moveId: action.moveId,
        actorCharacterId: action.actorCharacterId,
        ...(action.chainedFromCommandId !== undefined
          ? { chainedFromCommandId: action.chainedFromCommandId }
          : {}),
        ...(action.prefill !== undefined ? { prefill: action.prefill } : {}),
        ...(action.pendingVow === true ? { pendingVow: true } : {}),
      };
    case 'move-resolved':
      return {
        step: 'result',
        moveId: action.moveId,
        actorCharacterId: action.actorCharacterId,
        ...(action.aidingAllyId !== undefined ? { aidingAllyId: action.aidingAllyId } : {}),
        invoked: action.invoked,
        commandId: action.commandId,
        ...(action.checkTrigger === true ? { checkTrigger: true } : {}),
      };
    case 'open-pay-the-price':
      return {
        step: 'pay-the-price',
        actorCharacterId: action.actorCharacterId,
        ...(action.chainedFromCommandId !== undefined
          ? { chainedFromCommandId: action.chainedFromCommandId }
          : {}),
      };
    case 'pay-the-price-resolved':
      return {
        step: 'pay-the-price-result',
        actorCharacterId: action.actorCharacterId,
        resolved: action.resolved,
        commandId: action.commandId,
      };
    case 'reset':
      return { step: 'idle' };
  }
}

const MoveFlowStateContext = createContext<MoveFlowState | null>(null);
const MoveFlowDispatchContext = createContext<Dispatch<MoveFlowAction> | null>(null);

export function MoveFlowProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(moveFlowReducer, { step: 'idle' });
  return (
    <MoveFlowStateContext.Provider value={state}>
      <MoveFlowDispatchContext.Provider value={dispatch}>
        {children}
      </MoveFlowDispatchContext.Provider>
    </MoveFlowStateContext.Provider>
  );
}

export function useMoveFlow(): MoveFlowState {
  const state = useContext(MoveFlowStateContext);
  if (state === null) {
    throw new Error('useMoveFlow must be used within a MoveFlowProvider');
  }
  return state;
}

export function useMoveFlowActions(): {
  selectMove: (
    moveId: MoveId,
    actorCharacterId: CharacterId,
    chainedFromCommandId?: CommandId,
    prefill?: ComposerPrefill,
    pendingVow?: true,
  ) => void;
  moveResolved: (
    moveId: MoveId,
    actorCharacterId: CharacterId,
    invoked: InvokeMoveResponse,
    commandId: CommandId,
    aidingAllyId?: CharacterId,
    checkTrigger?: boolean,
  ) => void;
  openPayThePrice: (actorCharacterId: CharacterId, chainedFromCommandId?: CommandId) => void;
  payThePriceResolved: (
    actorCharacterId: CharacterId,
    resolved: ResolvePayThePriceResponse,
    commandId: CommandId,
  ) => void;
  reset: () => void;
} {
  const dispatch = useContext(MoveFlowDispatchContext);
  if (dispatch === null) {
    throw new Error('useMoveFlowActions must be used within a MoveFlowProvider');
  }
  return {
    selectMove: (moveId, actorCharacterId, chainedFromCommandId, prefill, pendingVow) =>
      dispatch({
        type: 'select-move',
        moveId,
        actorCharacterId,
        ...(chainedFromCommandId !== undefined ? { chainedFromCommandId } : {}),
        ...(prefill !== undefined ? { prefill } : {}),
        ...(pendingVow === true ? { pendingVow } : {}),
      }),
    moveResolved: (moveId, actorCharacterId, invoked, commandId, aidingAllyId, checkTrigger) =>
      dispatch({
        type: 'move-resolved',
        moveId,
        actorCharacterId,
        invoked,
        commandId,
        ...(aidingAllyId !== undefined ? { aidingAllyId } : {}),
        ...(checkTrigger === true ? { checkTrigger: true } : {}),
      }),
    openPayThePrice: (actorCharacterId, chainedFromCommandId) =>
      dispatch({
        type: 'open-pay-the-price',
        actorCharacterId,
        ...(chainedFromCommandId !== undefined ? { chainedFromCommandId } : {}),
      }),
    payThePriceResolved: (actorCharacterId, resolved, commandId) =>
      dispatch({ type: 'pay-the-price-resolved', actorCharacterId, resolved, commandId }),
    reset: () => dispatch({ type: 'reset' }),
  };
}
