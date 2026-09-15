import { describe, expect, it } from 'vitest';

import { NPC_RECIPE, type CharacterId } from '@astrolabe/rules';
import type { AstrolabeEvent, EventId } from '@astrolabe/shared';

import { project } from '../../projection/project.js';
import { createPlannerFromEnv, createProviderFromEnv } from '../create-provider.js';

import {
  buildWorldInterpretRequest,
  buildWorldPlanRequest,
  checkWorldInterpretation,
  checkWorldPlan,
  clockSection,
  describeAnswer,
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
      rerolls: 0,
    })),
  },
];

function answer(
  overrides: Partial<WorldInterpretation['entities'][number]> = {},
): WorldInterpretation {
  return {
    rerolls: [],
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
    expect(schema.safeParse({ review: 'r', recipes: [], questions: [] }).success).toBe(true);
    expect(schema.safeParse({ recipes: [] }).success).toBe(false);
    expect(
      schema.safeParse({ review: 'r', recipes: [{ recipe: 'npc', reason: 'x' }], questions: [] })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({
        review: 'r',
        recipes: [{ recipe: 'derelict', reason: 'x' }],
        questions: [],
      }).success,
    ).toBe(false);
    const request = buildWorldPlanRequest(project([]), BEAT, [NPC_RECIPE]);
    expect(request.user).toContain('<outcome_text>');
    expect(request.user).toContain(
      '<passage>\nThe trace narrows to one lit compartment.\n</passage>',
    );
  });

  it('carries earlier passages of the session so a result can be checked against what they already established (D-156)', () => {
    const withHistory: WorldBeat = {
      ...BEAT,
      recentNarration: ['Fletcher Hunt introduces himself as the sole survivor.'],
    };
    const plan = buildWorldPlanRequest(project([]), withHistory, [NPC_RECIPE]);
    expect(plan.user).toContain(
      '<recent_narration>\nFletcher Hunt introduces himself as the sole survivor.\n</recent_narration>',
    );

    const interpret = buildWorldInterpretRequest(project([]), withHistory, ROLLED, 2);
    expect(interpret.user).toContain('<recent_narration>');

    // Omitted entirely when there is none, same as outcomes and answers.
    expect(buildWorldPlanRequest(project([]), BEAT, [NPC_RECIPE]).user).not.toContain(
      '<recent_narration>',
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
    expect(checkWorldInterpretation(value, ROLLED, CREW, 2)).toBeUndefined();
  });

  it('refuses a missing slot, a field not citing its roll, and a name not built from name rolls', () => {
    expect(
      checkWorldInterpretation(
        answer({ fields: answer().entities[0]!.fields.slice(1) }),
        ROLLED,
        CREW,
        2,
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
        2,
      ),
    ).toMatch(/goal must cite its own roll, E1.goal/);
    expect(checkWorldInterpretation(answer({ nameCites: ['E1.role'] }), ROLLED, CREW, 2)).toMatch(
      /name must cite its own name rolls/,
    );
    expect(checkWorldInterpretation({ rerolls: [], entities: [] }, ROLLED, CREW, 2)).toMatch(
      /exactly one entity/,
    );
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
      checkWorldInterpretation(cites(['E1.goal.1', 'E1.goal.2']), twice, CREW, 2),
    ).toBeUndefined();
    expect(checkWorldInterpretation(cites(['E1.goal.2']), twice, CREW, 2)).toBeUndefined();
    expect(checkWorldInterpretation(cites(['E1.goal']), twice, CREW, 2)).toMatch(
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
        2,
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
        2,
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
    // A pressure beat's schema requires clock fields; the stub must satisfy it too (D-145).
    const pressured = await createProviderFromEnv({
      ASTROLABE_AI_PROVIDER: 'stub',
    }).generateStructured(
      buildWorldPlanRequest(project([]), { ...BEAT, pressure: true }, [NPC_RECIPE], { open: [] }),
      worldPlanSchema([NPC_RECIPE], { open: [] }),
    );
    expect(pressured).toMatchObject({ ok: true, value: { clocks: { create: [] } } });
  });

  it('plans the scene frame on Sonnet 5 unless ASTROLABE_PLAN_MODEL says otherwise (D-141, amended)', () => {
    expect(createPlannerFromEnv({ ANTHROPIC_API_KEY: 'k' }).model).toBe('claude-sonnet-5');
    expect(
      createPlannerFromEnv({ ANTHROPIC_API_KEY: 'k', ASTROLABE_PLAN_MODEL: 'claude-opus-5' }).model,
    ).toBe('claude-opus-5');
    expect(createPlannerFromEnv({ ASTROLABE_AI_PROVIDER: 'stub' }).name).toBe('stub');
  });

  it('accepts rerolls of current results with a reason, ignoring the entities (D-18, D-70)', () => {
    const value = answer();
    expect(
      checkWorldInterpretation(
        { ...value, rerolls: [{ roll: 'E1.goal', reason: 'The logs say no one stayed.' }] },
        ROLLED,
        CREW,
        2,
      ),
    ).toBeUndefined();
    expect(
      checkWorldInterpretation(
        { rerolls: [{ roll: 'E1.goal', reason: 'Contradicts the logs.' }], entities: [] },
        ROLLED,
        CREW,
        2,
      ),
    ).toBeUndefined();
  });

  it('refuses a reroll of an unknown, repeated or final result, or one whose reason names a player character (D-69)', () => {
    const reroll = (roll: string, reason = 'Contradicts the logs.') => ({ roll, reason });
    const check = (rerolls: { roll: string; reason: string }[], rolled = ROLLED, cap = 2) =>
      checkWorldInterpretation({ rerolls, entities: [] }, rolled, CREW, cap);

    expect(check([reroll('E9.goal')])).toMatch(/not a current result/);
    expect(check([reroll('E1.goal'), reroll('E1.goal')])).toMatch(/listed twice/);
    expect(check([reroll('E1.goal')], ROLLED, 0)).toMatch(/E1.goal is final/);
    const spent = [{ ...ROLLED[0]!, slots: ROLLED[0]!.slots.map((s) => ({ ...s, rerolls: 2 })) }];
    expect(check([reroll('E1.goal')], spent)).toMatch(/final/);
    expect(check([reroll('E1.goal', 'Vesna already found the logs empty.')])).toMatch(
      /names Vesna, a player character/,
    );
  });

  it('marks a result final at its cap and lists what a reroll discarded, with the reason', () => {
    const rolled = [
      {
        ...ROLLED[0]!,
        slots: ROLLED[0]!.slots.map((s) =>
          s.slot === 'goal' ? { ...s, key: 'E1.goalr2', rerolls: 2 } : s,
        ),
        discarded: [{ ...ROLLED[0]!.slots[1]!, reason: 'Contradicts the logs.' }],
      },
    ];
    const request = buildWorldInterpretRequest(project([]), BEAT, rolled, 2);
    expect(request.user).toContain('[E1.goalr2] goal: row goal (rolled 2) (final)');
    expect(request.user).not.toContain('[E1.role] role: row role (rolled 1) (final)');
    expect(request.user).toContain('discarded goal: row goal, because Contradicts the logs.');
  });

  it('lets the plan ask up to two yes/no questions at odds it sets (8.4, D-28)', () => {
    const schema = worldPlanSchema([NPC_RECIPE]);
    const plan = (questions: unknown[]) => ({ review: 'r', recipes: [], questions });
    expect(
      schema.safeParse(plan([{ question: 'Is anyone alive aboard?', odds: 'likely', onYes: null }]))
        .success,
    ).toBe(true);
    expect(
      schema.safeParse(
        plan([{ question: 'Is anyone alive aboard?', odds: 'certain', onYes: null }]),
      ).success,
    ).toBe(false);
    expect(
      checkWorldPlan(
        {
          review: 'r',
          recipes: [],
          questions: [{ question: 'Does Rook hear it?', odds: 'likely', onYes: null }],
        },
        CREW,
      ),
    ).toMatch(/names Rook, a player character/);
    expect(
      checkWorldPlan(
        {
          review: 'r',
          recipes: [],
          questions: [{ question: 'Is the reactor stable?', odds: 'unlikely', onYes: null }],
        },
        CREW,
      ),
    ).toBeUndefined();
  });

  it('describes an answer with its odds, and a match with the move’s twist', () => {
    const likely = 'oracle:moves/ask-the-oracle/likely';
    expect(
      describeAnswer({
        oracleId: likely,
        roll: 42,
        rowText: 'Yes',
        question: 'Is anyone alive aboard?',
      }),
    ).toBe('Asked of the oracle at likely odds: Is anyone alive aboard? The answer (42) is Yes.');
    expect(
      describeAnswer({
        oracleId: likely,
        roll: 77,
        rowText: 'No',
        question: 'Is anyone alive aboard?',
      }),
    ).toContain('The roll is a match. On a match, envision an extreme result or twist.');
  });

  describe('clocks (8.6, D-145)', () => {
    const offer = {
      open: [
        {
          key: 'C1',
          trackId: 't1' as never,
          title: 'Station power failing',
          ticks: 3,
          maxTicks: 4,
        },
      ],
    };
    const plan = (clocks: object) => ({ review: 'r', recipes: [], questions: [], clocks }) as never;
    const create = (over: object = {}) => ({
      title: 'Hull breach spreading',
      segments: 4,
      filled: 1,
      reason: 'Forcing the bulkhead cracked the seal.',
      ...over,
    });

    it('offers clock fields only with an offer', () => {
      const withClocks = {
        review: 'r',
        recipes: [],
        questions: [],
        clocks: { create: [create()], tick: [] },
      };
      expect(worldPlanSchema([NPC_RECIPE]).parse(withClocks)).not.toHaveProperty('clocks');
      expect(worldPlanSchema([NPC_RECIPE], offer).parse(withClocks)).toHaveProperty('clocks');
    });

    it('refuses clocks outside a pressure beat', () => {
      expect(checkWorldPlan(plan({ create: [create()] }), CREW)).toMatch(/only after a miss/);
      expect(checkWorldPlan(plan({ create: [] }), CREW)).toBeUndefined();
    });

    it('holds a new clock to its sizes and start, and a tick to an open clock with room', () => {
      expect(checkWorldPlan(plan({ create: [create()], tick: [] }), CREW, offer)).toBeUndefined();
      expect(checkWorldPlan(plan({ create: [create({ segments: 5 })] }), CREW, offer)).toMatch(
        /4, 6, 8 or 10 segments/,
      );
      expect(checkWorldPlan(plan({ create: [create({ filled: 4 })] }), CREW, offer)).toMatch(
        /0 to 3 filled/,
      );
      expect(checkWorldPlan(plan({ create: [create(), create()] }), CREW, offer)).toMatch(
        /at most one/,
      );
      const tick = (clock: string, segments: number) => ({
        clock,
        segments,
        reason: 'It spreads.',
      });
      expect(
        checkWorldPlan(plan({ create: [], tick: [tick('C1', 1)] }), CREW, offer),
      ).toBeUndefined();
      expect(checkWorldPlan(plan({ create: [], tick: [tick('C1', 2)] }), CREW, offer)).toMatch(
        /1 segment left/,
      );
      expect(checkWorldPlan(plan({ create: [], tick: [tick('C9', 1)] }), CREW, offer)).toMatch(
        /not an open clock/,
      );
      expect(
        checkWorldPlan(plan({ create: [], tick: [tick('C1', 1), tick('C1', 1)] }), CREW, offer),
      ).toMatch(/ticked twice/);
    });

    it('refuses a clock title or reason that names a player character (D-140)', () => {
      expect(
        checkWorldPlan(
          plan({ create: [create({ reason: 'Rook forced the bulkhead.' })] }),
          CREW,
          offer,
        ),
      ).toMatch(/names Rook/);
    });

    it('lists the open clocks in the rules it sends', () => {
      expect(clockSection(offer)).toContain('[C1] "Station power failing": 3 of 4 segments filled');
      expect(clockSection({ open: [] })).toContain('There are no open clocks.');
    });
  });
});
