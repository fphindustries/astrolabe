import type { MoveAutomation } from '../../schema/automation.js';

/**
 * The vow's rank and text, and the connection/bond +1/+2 add, are player
 * input gathered before this move rolls (campaign/vow setup, task 4.4) —
 * not part of what this outcome spec resolves.
 */
export const swearAnIronVow: MoveAutomation = {
  moveId: 'move:quest/swear-an-iron-vow',
  level: 'automated',
  outcomes: {
    strong_hit: {
      effects: [
        {
          effect: { kind: 'momentum', delta: 2, target: 'actor' },
          clause: 'Take +2 momentum.',
        },
      ],
    },
    weak_hit: {
      effects: [
        {
          effect: { kind: 'momentum', delta: 1, target: 'actor' },
          clause: 'Take +1 momentum,',
        },
      ],
    },
    miss: {
      effects: [],
    },
  },
};
