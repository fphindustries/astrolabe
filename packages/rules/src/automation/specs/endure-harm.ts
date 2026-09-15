import type { MoveAutomation } from '../../schema/automation.js';

/**
 * Beat 7 (A13): the preRoll is what the beat actually exercises — the AI
 * proposes an amount from this clause's range, the player adjusts it, and
 * only then does health change. The trigger itself (roll +iron or +health,
 * whichever is higher) is the imported layer's `highest` method over
 * [stat:iron, meter:health]; nothing to add here.
 *
 * The miss branch's health-zero compounding requirement — mark wounded or
 * permanently harmed, or roll oracle:moves/endure-harm — is a documented
 * simplification left unmodeled: it only applies when health was already
 * at 0 before this miss, a rare compounding state the golden session never
 * reaches, and impact-marking isn't wired up yet.
 */
export const endureHarm: MoveAutomation = {
  moveId: 'move:suffer/endure-harm',
  level: 'automated',
  preRoll: {
    effects: [
      {
        effect: {
          kind: 'proposed_amount',
          of: 'meter',
          meter: 'health',
          range: [-3, -1],
          proposedBy: 'ai',
          adjustableBy: 'player',
        },
        clause: 'suffer -1 health for minor harm, -2 for serious harm, or -3 for major harm.',
      },
    ],
  },
  outcomes: {
    strong_hit: {
      effects: [],
      choices: [
        {
          id: 'eh-strong',
          prompt: 'Choose one.',
          pick: { min: 1, max: 1 },
          options: [
            {
              id: 'shake-it-off',
              label: 'Shake it off: take +1 health',
              available: { not: { hasImpact: 'impact:wounded' } },
              effects: [
                {
                  effect: { kind: 'meter', meter: 'health', delta: 1, target: 'actor' },
                  clause: 'If you are not wounded, take +1 health',
                },
              ],
            },
            {
              id: 'embrace',
              label: 'Embrace the pain: take +1 momentum',
              effects: [
                {
                  effect: { kind: 'momentum', delta: 1, target: 'actor' },
                  clause: 'Take +1 momentum',
                },
              ],
            },
          ],
        },
      ],
    },
    weak_hit: {
      effects: [],
      choices: [
        {
          id: 'eh-weak',
          prompt: 'Lose momentum to recover?',
          pick: { min: 0, max: 1 },
          optional: true,
          options: [
            {
              id: 'lose-momentum-for-health',
              label: 'Lose Momentum (-1) in exchange for +1 health',
              available: { not: { hasImpact: 'impact:wounded' } },
              effects: [
                {
                  effect: { kind: 'momentum', delta: -1, target: 'actor' },
                  clause: 'you may [Lose Momentum](id:move:suffer/lose-momentum) (-1)',
                },
                {
                  effect: { kind: 'meter', meter: 'health', delta: 1, target: 'actor' },
                  clause: 'in exchange for +1 health.',
                },
              ],
            },
          ],
        },
      ],
    },
    miss: {
      effects: [],
      choices: [
        {
          id: 'eh-miss',
          prompt: 'Choose one.',
          pick: { min: 1, max: 1 },
          options: [
            {
              id: 'more-health',
              label: 'Suffer an additional -1 health',
              effects: [
                {
                  effect: { kind: 'meter', meter: 'health', delta: -1, target: 'actor' },
                  clause: 'Suffer an additional -1 health',
                },
              ],
            },
            {
              id: 'lose-momentum',
              label: 'Lose Momentum (-2)',
              effects: [
                {
                  effect: { kind: 'momentum', delta: -2, target: 'actor' },
                  clause: '[Lose Momentum](id:move:suffer/lose-momentum) (-2)',
                },
              ],
            },
          ],
        },
      ],
    },
  },
};
