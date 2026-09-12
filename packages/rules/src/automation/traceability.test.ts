import { describe, expect, it } from 'vitest';

import { STARFORGED } from '../generated/index.js';
import type { Choice, MoveAutomation, OutcomeSpec, TracedEffect } from '../schema/automation.js';
import { isVerbatimClause } from '../schema/traceability.js';
import { MOVE_AUTOMATION_SPECS } from './specs/index.js';

function tracedEffectsIn(spec: OutcomeSpec): readonly TracedEffect[] {
  const fromChoices = (spec.choices ?? []).flatMap((choice: Choice) =>
    choice.options.flatMap((option) => option.effects),
  );
  return [...spec.effects, ...fromChoices];
}

/**
 * "Every automated rule behaviour is traceable to the rule entry that
 * triggered it" (CLAUDE.md, Non-negotiables), checked rather than
 * asserted: this walks every hand-authored spec and confirms each clause
 * is still a verbatim substring of the move it claims to implement — an
 * outcome tier's clause against that tier's text, a preRoll or method
 * clause (which has no tier) against the whole move body. A future
 * Datasworn version that rewords a move fails here, not silently.
 */
describe('every automation spec is traceable to the move text it implements', () => {
  for (const automation of MOVE_AUTOMATION_SPECS.values()) {
    describe(automation.moveId, () => {
      const move = STARFORGED.moves.find((m) => m.id === automation.moveId);

      it('exists in the imported move set', () => {
        expect(move).toBeDefined();
      });

      it('has an outcome spec only for tiers the move actually defines', () => {
        expect(move).toBeDefined();
        for (const tier of Object.keys(
          automation.outcomes,
        ) as (keyof MoveAutomation['outcomes'])[]) {
          expect(move?.outcomes, `${automation.moveId} has no outcomes at all`).not.toBeNull();
          expect(
            move?.outcomes?.[tier],
            `${automation.moveId} has no ${tier} outcome`,
          ).toBeDefined();
        }
      });

      for (const [tier, spec] of Object.entries(automation.outcomes) as [
        keyof MoveAutomation['outcomes'],
        OutcomeSpec,
      ][]) {
        it(`${tier}: every clause is a verbatim substring of the ${tier} text`, () => {
          const tierText = move?.outcomes?.[tier]?.text;
          expect(tierText).toBeDefined();
          for (const traced of tracedEffectsIn(spec)) {
            expect(
              isVerbatimClause(traced.clause, tierText ?? ''),
              `clause "${traced.clause}" not found in ${automation.moveId}'s ${tier} text`,
            ).toBe(true);
          }
        });
      }

      if (automation.preRoll !== undefined) {
        const preRoll = automation.preRoll;
        it('preRoll: every clause is a verbatim substring of the move’s full text', () => {
          expect(move).toBeDefined();
          for (const traced of tracedEffectsIn(preRoll)) {
            expect(
              isVerbatimClause(traced.clause, move?.text ?? ''),
              `preRoll clause "${traced.clause}" not found in ${automation.moveId}'s text`,
            ).toBe(true);
          }
        });
      }

      if (automation.method !== undefined) {
        const method = automation.method;
        it('method: every option’s clauseRef and effect clauses are verbatim substrings of the move’s full text', () => {
          expect(move).toBeDefined();
          for (const option of method.options) {
            expect(
              isVerbatimClause(option.clauseRef, move?.text ?? ''),
              `method option "${option.id}" clauseRef "${option.clauseRef}" not found in ${automation.moveId}'s text`,
            ).toBe(true);
            for (const traced of option.effects) {
              expect(
                isVerbatimClause(traced.clause, move?.text ?? ''),
                `method option "${option.id}" effect clause "${traced.clause}" not found in ${automation.moveId}'s text`,
              ).toBe(true);
            }
          }
        });
      }
    });
  }

  it('covers exactly the moves D-59 scopes Milestone 1 to', () => {
    const ids = [...MOVE_AUTOMATION_SPECS.keys()].sort();
    expect(ids).toEqual(
      [
        'move:fate/ask-the-oracle',
        'move:session/begin-a-session',
        'move:session/end-a-session',
        'move:suffer/endure-harm',
        'move:adventure/face-danger',
        'move:adventure/gather-information',
        'move:fate/pay-the-price',
        'move:quest/reach-a-milestone',
        'move:adventure/secure-an-advantage',
        'move:quest/swear-an-iron-vow',
      ].sort(),
    );
  });
});
