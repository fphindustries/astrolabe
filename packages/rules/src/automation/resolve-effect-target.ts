import type { MoveInvocation, EffectTarget } from '../schema/automation.js';
import type { CharacterId } from '../schema/ids.js';
import type { OutcomeTier } from '../schema/moves.js';

/**
 * D-62: Aid Your Ally is a flag, not its own move. Its whole rulebook text
 * is "if you score a hit, they (instead of you) take the benefits of the
 * move" — so on a hit, an 'actor'-targeted effect redirects to the aided
 * ally; on a miss, the actor keeps their own consequences, since the text
 * only redirects benefits, not the cost of failing.
 */
export function resolveEffectTarget(
  target: EffectTarget,
  invocation: MoveInvocation,
  tier: OutcomeTier,
): CharacterId {
  const isHit = tier === 'strong_hit' || tier === 'weak_hit';
  if (invocation.aidingAllyId !== undefined && isHit) {
    return invocation.aidingAllyId;
  }
  if (target === 'aided_ally' && invocation.aidingAllyId !== undefined) {
    return invocation.aidingAllyId;
  }
  return invocation.actorId;
}
