import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';

import type { AssetId, CharacterId, MoveId } from '@astrolabe/rules';
import type { EntityId, TrackKind } from '@astrolabe/shared';

/**
 * Play-screen-local UI state: which drawer is open, if any.
 *
 * This is what's left in the client after server state moves to
 * react-query (D-96) — small enough for `useReducer` plus context, so
 * `zustand` was dropped rather than kept unused. Tasks 5.6/5.7 add the
 * `entity`, `track`, `asset` and `moves` kinds this comment used to
 * anticipate.
 */

export type DrawerState =
  | { readonly kind: 'character'; readonly characterId: CharacterId }
  | { readonly kind: 'entity'; readonly entityId: EntityId }
  | { readonly kind: 'track'; readonly trackKind: TrackKind }
  | { readonly kind: 'asset'; readonly assetId: AssetId }
  /** D-148: opened on one move when a suggestion names a move the composer can't play. */
  | { readonly kind: 'moves'; readonly moveId?: MoveId }
  | null;

type PlayUiAction =
  | { readonly type: 'open-character-drawer'; readonly characterId: CharacterId }
  | { readonly type: 'open-entity-drawer'; readonly entityId: EntityId }
  | { readonly type: 'open-track-drawer'; readonly trackKind: TrackKind }
  | { readonly type: 'open-asset-drawer'; readonly assetId: AssetId }
  | { readonly type: 'open-moves-drawer'; readonly moveId?: MoveId }
  | { readonly type: 'close-drawer' };

interface PlayUiState {
  readonly drawer: DrawerState;
}

function playUiReducer(state: PlayUiState, action: PlayUiAction): PlayUiState {
  switch (action.type) {
    case 'open-character-drawer':
      return { drawer: { kind: 'character', characterId: action.characterId } };
    case 'open-entity-drawer':
      return { drawer: { kind: 'entity', entityId: action.entityId } };
    case 'open-track-drawer':
      return { drawer: { kind: 'track', trackKind: action.trackKind } };
    case 'open-asset-drawer':
      return { drawer: { kind: 'asset', assetId: action.assetId } };
    case 'open-moves-drawer':
      return {
        drawer: {
          kind: 'moves',
          ...(action.moveId !== undefined ? { moveId: action.moveId } : {}),
        },
      };
    case 'close-drawer':
      return { drawer: null };
  }
}

const PlayUiStateContext = createContext<PlayUiState | null>(null);
const PlayUiDispatchContext = createContext<Dispatch<PlayUiAction> | null>(null);

export function PlayUiProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(playUiReducer, { drawer: null });
  return (
    <PlayUiStateContext.Provider value={state}>
      <PlayUiDispatchContext.Provider value={dispatch}>{children}</PlayUiDispatchContext.Provider>
    </PlayUiStateContext.Provider>
  );
}

function usePlayUiState(): PlayUiState {
  const state = useContext(PlayUiStateContext);
  if (state === null) {
    throw new Error('usePlayUiState must be used within a PlayUiProvider');
  }
  return state;
}

function usePlayUiDispatch(): Dispatch<PlayUiAction> {
  const dispatch = useContext(PlayUiDispatchContext);
  if (dispatch === null) {
    throw new Error('usePlayUiDispatch must be used within a PlayUiProvider');
  }
  return dispatch;
}

export function useDrawer(): DrawerState {
  return usePlayUiState().drawer;
}

export function useDrawerActions(): {
  openCharacterDrawer: (characterId: CharacterId) => void;
  openEntityDrawer: (entityId: EntityId) => void;
  openTrackDrawer: (trackKind: TrackKind) => void;
  openAssetDrawer: (assetId: AssetId) => void;
  openMovesDrawer: (moveId?: MoveId) => void;
  closeDrawer: () => void;
} {
  const dispatch = usePlayUiDispatch();
  return {
    openCharacterDrawer: (characterId: CharacterId) =>
      dispatch({ type: 'open-character-drawer', characterId }),
    openEntityDrawer: (entityId: EntityId) => dispatch({ type: 'open-entity-drawer', entityId }),
    openTrackDrawer: (trackKind: TrackKind) => dispatch({ type: 'open-track-drawer', trackKind }),
    openAssetDrawer: (assetId: AssetId) => dispatch({ type: 'open-asset-drawer', assetId }),
    openMovesDrawer: (moveId?: MoveId) =>
      dispatch({ type: 'open-moves-drawer', ...(moveId !== undefined ? { moveId } : {}) }),
    closeDrawer: () => dispatch({ type: 'close-drawer' }),
  };
}
