import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';

import type { CharacterId } from '@astrolabe/rules';

/**
 * Play-screen-local UI state: which drawer is open, if any.
 *
 * This is what's left in the client after server state moves to
 * react-query (D-96) — small enough for `useReducer` plus context, so
 * `zustand` was dropped rather than kept unused. Extend `DrawerState`'s
 * union as later tasks add drawer kinds (npc, track, move, asset — 5.6, 5.7).
 */

export type DrawerState = { readonly kind: 'character'; readonly characterId: CharacterId } | null;

type PlayUiAction =
  | { readonly type: 'open-character-drawer'; readonly characterId: CharacterId }
  | { readonly type: 'close-drawer' };

interface PlayUiState {
  readonly drawer: DrawerState;
}

function playUiReducer(state: PlayUiState, action: PlayUiAction): PlayUiState {
  switch (action.type) {
    case 'open-character-drawer':
      return { drawer: { kind: 'character', characterId: action.characterId } };
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
  closeDrawer: () => void;
} {
  const dispatch = usePlayUiDispatch();
  return {
    openCharacterDrawer: (characterId: CharacterId) =>
      dispatch({ type: 'open-character-drawer', characterId }),
    closeDrawer: () => dispatch({ type: 'close-drawer' }),
  };
}
