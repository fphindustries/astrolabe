import type { MoveAutomation } from '../../schema/automation.js';

/**
 * "Mark progress per the rank of the vow" needs a rank-to-ticks lookup
 * that doesn't exist yet (vows aren't modelled until the campaign/vow
 * tasks), and Beat 10 only ever offers this move — "the app reminds him
 * that Reach a Milestone is available if he judges one was earned" — it is
 * the player's call whether one was earned, not something to compute.
 * Left with no effects rather than a guessed tick count.
 */
export const reachAMilestone: MoveAutomation = {
  moveId: 'move:quest/reach-a-milestone',
  level: 'automated',
  outcomes: {},
};
