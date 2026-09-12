import type { MoveAutomation } from '../../schema/automation.js';

/**
 * D-08: three options, the table roll highlighted as the default. Only the
 * "You are harmed" row (75-81) chains to an Automated move per D-59 —
 * Endure Harm. The other three suffer-move rows (vehicle damage 63-68,
 * wasted resources 69-74, stress 82-88) chain to moves that stay at
 * Reference in Milestone 1, so they are deliberately absent from `rows`
 * here; resolvePayThePriceChain (resolve-pay-the-price.ts) treats an
 * unmatched roll as narration-only (D-67), which is exactly what those
 * three rows get until they have their own specs. Row 96-100 ("Roll
 * twice") is handled by resolvePayThePriceChain's recursion (D-68), not by
 * a chain row here — the table has no single destination for it.
 */
export const payThePrice: MoveAutomation = {
  moveId: 'move:fate/pay-the-price',
  level: 'automated',
  outcomes: {},
  method: {
    prompt: 'Choose one.',
    options: [
      {
        id: 'obvious',
        label: 'Make the most obvious negative outcome happen',
        effects: [],
        clauseRef: 'Make the most obvious negative outcome happen.',
      },
      {
        id: 'oracle',
        label: 'Ask the Oracle for inspiration',
        effects: [],
        clauseRef:
          'for inspiration. Interpret the answer as a hardship or complication appropriate to the situation.',
      },
      {
        id: 'table',
        label: 'Roll on the table',
        highlighted: true,
        effects: [
          {
            effect: { kind: 'oracle_roll', oracle: 'oracle:moves/pay-the-price' },
            clause: 'Roll on the table below.',
          },
        ],
        clauseRef: 'Roll on the table below.',
        chain: {
          mode: 'auto',
          reason: 'Pay the Price, table result',
          fromOracle: 'oracle:moves/pay-the-price',
          rows: [{ min: 75, max: 81, to: 'move:suffer/endure-harm' }],
        },
      },
    ],
  },
};
