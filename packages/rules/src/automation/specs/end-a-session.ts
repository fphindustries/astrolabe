import type { MoveAutomation } from '../../schema/automation.js';

/**
 * The move's one effect — "+1 momentum" for noting a thread to pursue next
 * session — is conditional on the player choosing to do so, and Beat 10
 * doesn't narrate it happening. Left unmodeled rather than invented; the
 * summary and open-threads output Beat 10 actually tests is task 9.4's
 * concern, not a rules effect.
 */
export const endASession: MoveAutomation = {
  moveId: 'move:session/end-a-session',
  level: 'automated',
  outcomes: {},
};
