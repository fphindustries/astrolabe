import type { MoveAutomation } from '../../schema/automation.js';

/**
 * "Make a suffer move (-1)" on a weak hit does not name which suffer move —
 * Endure Harm or Endure Stress, depending on whether the danger was
 * physical or mental/spiritual. That is a fictional judgment the design
 * record's authority model gives to the player ("Which move applies"),
 * not something this spec can fix to one chain target. So the weak hit
 * carries no automated chain; the relevant-moves panel (task 6.1) surfaces
 * both suffer moves as always relevant instead.
 */
export const faceDanger: MoveAutomation = {
  moveId: 'move:adventure/face-danger',
  level: 'automated',
  outcomes: {
    strong_hit: {
      effects: [
        {
          effect: { kind: 'momentum', delta: 1, target: 'actor' },
          clause: 'Take +1 momentum.',
        },
      ],
    },
    weak_hit: {
      effects: [],
    },
    miss: {
      effects: [],
      chain: { mode: 'offer', reason: 'Face Danger, miss', to: 'move:fate/pay-the-price' },
    },
  },
};
