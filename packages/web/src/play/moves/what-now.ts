import type { Move, MoveAutomation, MoveId } from '@astrolabe/rules';
import type { PayloadFor } from '@astrolabe/shared';

import type { CrewCardView } from '../crew/crew.js';

/**
 * "What now?" (task 9.3, D-148) as the composer shows it. Pure, so the
 * panel stays a thin binding.
 */

export type SuggestedAction = PayloadFor<'actions.suggested'>['suggestions'][number];

export interface SuggestedActionView {
  readonly callsign: string;
  readonly actionText: string;
  readonly moveName: string | undefined;
  /** Whether the composer can play the move; otherwise it opens in the moves drawer. */
  readonly playable: boolean;
  readonly reason: string;
  readonly anchors: readonly string[];
}

/**
 * The composer plays a move with outcome automation that isn't resolved by
 * a method — the same test `invokeMove` applies. Anything else is read in
 * the moves drawer (D-148).
 */
export function isComposerPlayable(
  moveId: MoveId,
  specs: ReadonlyMap<MoveId, MoveAutomation>,
): boolean {
  const spec = specs.get(moveId);
  return spec !== undefined && spec.method === undefined && Object.keys(spec.outcomes).length > 0;
}

export function toSuggestedActionView(
  suggestion: SuggestedAction,
  crew: readonly Pick<CrewCardView, 'characterId' | 'callsign'>[],
  moves: readonly Pick<Move, 'id' | 'name'>[],
  specs: ReadonlyMap<MoveId, MoveAutomation>,
): SuggestedActionView {
  const moveId = suggestion.moveId as MoveId | null;
  return {
    callsign:
      crew.find((c) => c.characterId === suggestion.characterId)?.callsign ?? 'A crew member',
    actionText: suggestion.actionText,
    moveName: moveId === null ? undefined : (moves.find((m) => m.id === moveId)?.name ?? moveId),
    playable: moveId !== null && isComposerPlayable(moveId, specs),
    reason: suggestion.reason,
    anchors: suggestion.anchors,
  };
}
