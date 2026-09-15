import type { MethodOption, MoveAutomation } from '../../schema/automation.js';
import type { OracleId } from '../../schema/ids.js';

/**
 * Two of the move's four approaches are narrative only (draw a conclusion,
 * spark an idea): no effect, they just name what the AI does. "Ask a
 * yes/no question" rolls one of the five odds tables. "Pick two" is folded
 * into the same five options rather than modelled as its own two-option
 * structure: mechanically it is "rate one envisioned option as likely and
 * roll", which is exactly the "likely" odds table applied to whichever
 * option the player rates that way — a documented simplification, not a
 * missing feature.
 */
const oddsOption = (id: string, label: string, oracle: OracleId): MethodOption => ({
  id,
  label,
  effects: [
    {
      effect: { kind: 'oracle_roll', oracle },
      clause: 'roll on the table below to check the answer.',
    },
  ],
  clauseRef: 'Decide the odds of a yes, and roll on the table below to check the answer.',
});

export const askTheOracle: MoveAutomation = {
  moveId: 'move:fate/ask-the-oracle',
  level: 'automated',
  outcomes: {},
  method: {
    prompt: 'How do you resolve it?',
    options: [
      {
        id: 'draw-conclusion',
        label: 'Draw a conclusion',
        effects: [],
        clauseRef:
          'Draw a conclusion: Decide the answer based on the most interesting and obvious result.',
      },
      {
        id: 'spark-idea',
        label: 'Spark an idea',
        effects: [],
        clauseRef: 'Spark an idea: Use an oracle table or other random prompt.',
      },
      oddsOption('small-chance', 'Small chance', 'oracle:moves/ask-the-oracle/small-chance'),
      oddsOption('unlikely', 'Unlikely', 'oracle:moves/ask-the-oracle/unlikely'),
      oddsOption('fifty-fifty', '50/50', 'oracle:moves/ask-the-oracle/fifty-fifty'),
      oddsOption('likely', 'Likely', 'oracle:moves/ask-the-oracle/likely'),
      oddsOption('almost-certain', 'Almost certain', 'oracle:moves/ask-the-oracle/almost-certain'),
    ],
  },
};
