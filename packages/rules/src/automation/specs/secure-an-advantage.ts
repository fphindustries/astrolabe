import type { MoveAutomation } from '../../schema/automation.js';

/**
 * Beat 5, D-61: the rules data wins over the beat's original wording — a
 * strong hit grants both benefits with no choice; the choice sits on the
 * weak hit. golden-session.md was amended to match.
 */
export const secureAnAdvantage: MoveAutomation = {
  moveId: 'move:adventure/secure-an-advantage',
  level: 'automated',
  outcomes: {
    strong_hit: {
      effects: [
        {
          effect: { kind: 'momentum', delta: 2, target: 'actor' },
          clause: 'Take +2 momentum.',
        },
        {
          effect: {
            kind: 'bonus_next_move',
            amount: 1,
            excludes: 'progress_moves',
            target: 'actor',
          },
          clause: 'Add +1 on your next move (not a progress move).',
        },
      ],
    },
    weak_hit: {
      effects: [],
      choices: [
        {
          id: 'saa-weak',
          prompt: 'Choose one.',
          pick: { min: 1, max: 1 },
          options: [
            {
              id: 'momentum',
              label: 'Take +2 momentum',
              effects: [
                {
                  effect: { kind: 'momentum', delta: 2, target: 'actor' },
                  clause: 'Take +2 momentum',
                },
              ],
            },
            {
              id: 'bonus',
              label: 'Add +1 on your next move',
              effects: [
                {
                  effect: {
                    kind: 'bonus_next_move',
                    amount: 1,
                    excludes: 'progress_moves',
                    target: 'actor',
                  },
                  clause: 'Add +1 on your next move (not a progress move)',
                },
              ],
            },
          ],
        },
      ],
    },
    miss: {
      effects: [],
      chain: { mode: 'offer', reason: 'Secure an Advantage, miss', to: 'move:fate/pay-the-price' },
    },
  },
};
