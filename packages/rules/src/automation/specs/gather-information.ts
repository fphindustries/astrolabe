import type { MoveAutomation } from '../../schema/automation.js';

/**
 * Beat 3: Juno's weak hit reads "Weak hit, +1 momentum" — the clause below
 * is exactly that. The move also names an inspiration oracle
 * (oracle:misc/story-clue) via Datasworn's `oracles` field, but Datasworn's
 * own documentation says not to roll those automatically — they're an
 * option for the AI's narration, not a required roll — so no effect forces
 * it here.
 */
export const gatherInformation: MoveAutomation = {
  moveId: 'move:adventure/gather-information',
  level: 'automated',
  outcomes: {
    strong_hit: {
      effects: [
        {
          effect: { kind: 'momentum', delta: 2, target: 'actor' },
          clause: 'Then, take +2 momentum.',
        },
      ],
    },
    weak_hit: {
      complication: { clause: 'but also complicates your quest' },
      effects: [
        {
          effect: { kind: 'momentum', delta: 1, target: 'actor' },
          clause: 'Then, take +1 momentum.',
        },
      ],
    },
    miss: {
      effects: [],
      chain: { mode: 'offer', reason: 'Gather Information, miss', to: 'move:fate/pay-the-price' },
    },
  },
};
