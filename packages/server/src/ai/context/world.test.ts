import { describe, expect, it } from 'vitest';

import { NPC_RECIPE, type CharacterId } from '@astrolabe/rules';
import type { AstrolabeEvent, EventId } from '@astrolabe/shared';

import { project } from '../../projection/project.js';
import { createProviderFromEnv } from '../create-provider.js';

import {
  buildWorldPlanRequest,
  checkWorldInterpretation,
  outcomeTexts,
  worldInterpretSchema,
  worldPlanSchema,
  type RolledRecipe,
  type WorldBeat,
  type WorldInterpretation,
} from './world.js';

const CREW = [
  { id: 'c-vesna' as CharacterId, callsign: 'Vesna', name: 'Vesna Kade' },
  { id: 'c-rook' as CharacterId, callsign: 'Rook', name: 'Rook Ilari' },
];

const ROLLED: readonly RolledRecipe[] = [
  {
    instance: 'E1',
    recipe: NPC_RECIPE,
    reason: 'Someone is alive aboard.',
    slots: NPC_RECIPE.rolls.map((roll, i) => ({
      key: `E1.${roll.slot}`,
      slot: roll.slot,
      name: roll.name === true,
      oracleId: roll.oracle,
      roll: i + 1,
      rowText: `row ${roll.slot}`,
      eventId: `evt-${roll.slot}` as EventId,
    })),
  },
];

function answer(
  overrides: Partial<WorldInterpretation['entities'][number]> = {},
): WorldInterpretation {
  return {
    entities: [
      {
        instance: 'E1',
        name: 'Sura Vance',
        nameCites: ['E1.given_name', 'E1.family_name'],
        fields: [
          { slot: 'role', text: 'Keeps the relay alive.', cites: ['E1.role'] },
          { slot: 'goal', text: 'Wants to be left alone.', cites: ['E1.goal'] },
          { slot: 'first_look', text: 'Gaunt.', cites: ['E1.first_look'] },
          { slot: 'disposition', text: 'Wary.', cites: ['E1.disposition'] },
        ],
        ...overrides,
      },
    ],
  };
}

const BEAT: WorldBeat = {
  facts: {
    facts: [],
    lines: ['Vesna makes the move Gather Information with wits.'],
    declaredAction: true,
    miss: false,
    match: false,
    burned: false,
    chainedToSuffer: false,
  },
  outcomes: ['Gather Information: On a strong hit, you discover something helpful and specific.'],
  passage: 'The trace narrows to one lit compartment.',
};

describe('the world pass prompts and checks (task 8.1, D-138, D-140)', () => {
  it('offers only the recipes it is given, as an enum', () => {
    const schema = worldPlanSchema([NPC_RECIPE]);
    expect(schema.safeParse({ review: 'r', recipes: [] }).success).toBe(true);
    expect(schema.safeParse({ recipes: [] }).success).toBe(false);
    expect(
      schema.safeParse({ review: 'r', recipes: [{ recipe: 'npc', reason: 'x' }] }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ review: 'r', recipes: [{ recipe: 'derelict', reason: 'x' }] }).success,
    ).toBe(false);
    const request = buildWorldPlanRequest(project([]), BEAT, [NPC_RECIPE]);
    expect(request.user).toContain('<outcome_text>');
    expect(request.user).toContain(
      '<passage>\nThe trace narrows to one lit compartment.\n</passage>',
    );
  });

  it('reads the outcome text at the tier a momentum burn left it on', () => {
    const events = [
      {
        id: 'e1',
        commandId: 'c1',
        type: 'move.invoked',
        payload: { moveId: 'move:adventure/gather-information' },
      },
      { id: 'e2', commandId: 'c1', type: 'dice.rolled', payload: { tier: 'weak_hit' } },
      {
        id: 'e3',
        commandId: 'c2',
        type: 'momentum.burned',
        payload: { rollEventId: 'e2', tierAfter: 'strong_hit' },
      },
    ] as unknown as AstrolabeEvent[];
    const [text] = outcomeTexts(events);
    expect(text).toMatch(/^Gather Information: On a strong hit, you discover something helpful/);
    expect(text).not.toContain('__');
  });

  it('accepts an interpretation that answers every slot once from its own rolls', () => {
    const value = worldInterpretSchema(ROLLED).parse(answer());
    expect(checkWorldInterpretation(value, ROLLED, CREW)).toBeUndefined();
  });

  it('refuses a missing slot, a field not citing its roll, and a name not built from name rolls', () => {
    expect(
      checkWorldInterpretation(
        answer({ fields: answer().entities[0]!.fields.slice(1) }),
        ROLLED,
        CREW,
      ),
    ).toMatch(/role slot exactly once/);
    expect(
      checkWorldInterpretation(
        answer({
          fields: answer().entities[0]!.fields.map((f) =>
            f.slot === 'goal' ? { ...f, cites: ['E1.role'] } : f,
          ),
        }),
        ROLLED,
        CREW,
      ),
    ).toMatch(/goal must cite its own roll, E1.goal/);
    expect(checkWorldInterpretation(answer({ nameCites: ['E1.role'] }), ROLLED, CREW)).toMatch(
      /name must cite its own name rolls/,
    );
    expect(checkWorldInterpretation({ entities: [] }, ROLLED, CREW)).toMatch(/exactly one entity/);
  });

  it('lets a slot with several results cite any of them (a "Roll twice" goal)', () => {
    const twice: readonly RolledRecipe[] = [
      {
        ...ROLLED[0]!,
        slots: ROLLED[0]!.slots.flatMap((s) =>
          s.slot === 'goal'
            ? [1, 2].map((n) => ({
                ...s,
                key: `E1.goal.${n}`,
                eventId: `evt-goal-${n}` as EventId,
              }))
            : [s],
        ),
      },
    ];
    const cites = (keys: string[]) =>
      answer({
        fields: answer().entities[0]!.fields.map((f) =>
          f.slot === 'goal' ? { ...f, cites: keys } : f,
        ),
      });
    expect(
      checkWorldInterpretation(cites(['E1.goal.1', 'E1.goal.2']), twice, CREW),
    ).toBeUndefined();
    expect(checkWorldInterpretation(cites(['E1.goal.2']), twice, CREW)).toBeUndefined();
    expect(checkWorldInterpretation(cites(['E1.goal']), twice, CREW)).toMatch(
      /goal is not one of its slots, or cites another entity's rolls|must cite its own roll/,
    );
  });

  it('refuses world text that names a player character (D-140), but not a common word', () => {
    expect(
      checkWorldInterpretation(
        answer({
          fields: answer().entities[0]!.fields.map((f) =>
            f.slot === 'role' ? { ...f, text: 'Rook’s old sergeant.' } : f,
          ),
        }),
        ROLLED,
        CREW,
      ),
    ).toMatch(/names Rook, a player character/);
    expect(
      checkWorldInterpretation(
        answer({
          fields: answer().entities[0]!.fields.map((f) =>
            f.slot === 'first_look' ? { ...f, text: 'Moves like a rook on a board.' } : f,
          ),
        }),
        ROLLED,
        CREW,
      ),
    ).toBeUndefined();
  });

  it('gets a plan from the dev stub that asks for nothing', async () => {
    const result = await createProviderFromEnv({
      ASTROLABE_AI_PROVIDER: 'stub',
    }).generateStructured(
      buildWorldPlanRequest(project([]), BEAT, [NPC_RECIPE]),
      worldPlanSchema([NPC_RECIPE]),
    );
    expect(result).toMatchObject({ ok: true, value: { recipes: [] } });
  });
});
