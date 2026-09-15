import type { OutcomeTier } from '../schema/moves.js';
import type { MoveId } from '../schema/ids.js';

import { MOVE_AUTOMATION_SPECS } from './specs/index.js';

/**
 * D-15, D-143 (8.7): whether a move's outcome at this tier calls for a
 * complication with no menu, and the clause that calls for it. The move
 * flow and the server read the same answer, so a burn that changes the
 * tier changes the requirement on both.
 */
export function complicationFor(
  moveId: MoveId,
  tier: OutcomeTier,
): { readonly clause: string } | undefined {
  return MOVE_AUTOMATION_SPECS.get(moveId)?.outcomes[tier]?.complication;
}
