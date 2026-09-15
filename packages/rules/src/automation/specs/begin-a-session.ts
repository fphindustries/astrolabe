import type { MoveAutomation } from '../../schema/automation.js';

/**
 * Automated in name (D-59) but empty in substance: this move's real
 * content — reviewing flags, recapping, setting the scene — is the
 * session-recap task (9.1), not a rules effect. The one numeric effect
 * ("all players take +1 momentum") only fires if the AI spotlights a new
 * danger, which Beat 1 doesn't do, so it's left unmodeled rather than
 * invented for a branch the golden session never takes.
 */
export const beginASession: MoveAutomation = {
  moveId: 'move:session/begin-a-session',
  level: 'automated',
  outcomes: {},
};
