import {
  ODDS_ORACLES,
  ORACLE_MATCH_CLAUSE,
  ORACLE_ODDS,
  STARFORGED,
  isOracleMatch,
  withoutLinks,
  type OracleId,
  type OracleRecipe,
  type OutcomeTier,
  type TrackId,
} from '@astrolabe/rules';
import type { AstrolabeEvent, CampaignState, EventId } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import type { BeatFacts } from './describe-beat.js';
import { renderState } from './render-state.js';
import { namedCharacter, type SegmentContext } from './segments.js';

/**
 * The world pass's prompts and checks (task 8.1; D-137, D-138, D-140).
 * Pure, like the rest of this directory.
 *
 * It runs after a beat's passage has committed (D-138, amended). The
 * **plan** decides whether the world needs anything the dice should ground
 * and names recipes by enum; the server rolls them; the **interpret** call
 * turns each recipe's rolls into an entity, citing the rolls it used. The
 * AI names what to roll and never a result (D-137).
 */

export const WORLD_RULES = `You run the world for a solo game of Ironsworn: Starforged, played through an app that tracks every rule and every number. The players decide everything their characters do, think and feel. The world is yours: non-player characters, places, machines and what they do.

You never invent what an oracle would decide. When the world needs something new that dice should ground, you name a recipe, the app rolls its oracle tables, and you interpret the results.`;

/** D-28 (8.4): the Guide may ask the oracle about the world, with odds it sets. */
export const QUESTION_RULES = `Questions: when something about the world is genuinely uncertain, matters to what comes next, and is not yours to simply decide from what is established, ask it as a yes/no question with the odds of a yes you judge from everything established: small_chance, unlikely, fifty_fifty, likely or almost_certain. The app rolls it. Most of the time there is no question: answer with an empty list. Never ask about anything a player character does, thinks, feels or decides, and never name a player character in a question. When a recipe only makes sense if the answer is yes (someone is there only if the oracle says so), name it in that question's onYes instead of requesting it: it is rolled only on a yes. Otherwise onYes is null.`;

const PLAN_RULES = `A beat of play has just resolved and been narrated. Decide whether it brings anything new into the world that the dice should ground.

Most beats need nothing: answer with an empty list. Request a recipe only when the beat's outcome, or the passage that narrated it, brings a new one into the story and nothing already established is it. A move's outcome text may ask the players to envision what they discover; you decide what the world holds, so if that discovery is a person not yet established, request the recipe rather than leaving it vague.

The passage was written before this decision by a narrator who may not introduce new people, so it leaves what the beat uncovered open. That is not evidence that no one is there: whether the discovery includes a person is yours to decide now, from the outcome and everything established.

Never request a recipe for something already established in the campaign state or the recent narration. Each request gives a one-line reason grounded in the beat.

${QUESTION_RULES}`;

const INTERPRET_RULES = `The app has rolled the oracle tables you asked for. Interpret each recipe's rolls as one new entity that fits the beat and everything established.

First, review every result against what is established. A result that is surprising, awkward or unwelcome is kept and interpreted: the dice are meant to surprise. Only a result that contradicts something already established (in the campaign state, the recent narration or the beat) may be rerolled. List it in rerolls with a one-line reason naming what it contradicts, and leave entities empty: the app rerolls it, shows the discarded result struck through with your reason, and asks you again. A result marked (final) has used its rerolls and must be interpreted as it is. When nothing contradicts, rerolls is empty and you answer the entities.

- The name: build it from the name rolls, picking, combining or adapting them. Cite the name rolls you used.
- Every other slot: one or two sentences interpreting that slot's roll in this situation, citing that roll. A slot with several results (a roll that said to roll twice, or to combine two tables) takes them together, citing each one it uses. Stay with what the roll says; do not add a history, a motive or a named person, place or faction the rolls do not give.
- Never name a player character, and never say what a player character does, thinks or feels. Describe the entity as the world holds it.
- A field says what the entity is: never an encounter or exchange with the crew that has not happened (no hail answered, no doorway filled as they arrive). What happens when they meet is for play to decide.`;

// ---------------------------------------------------------------------------
// The beat being followed
// ---------------------------------------------------------------------------

const TIER_OF_BURN = (events: readonly AstrolabeEvent[]) =>
  new Map(
    events.flatMap((event) =>
      event.type === 'momentum.burned'
        ? [[event.payload.rollEventId, event.payload.tierAfter]]
        : [],
    ),
  );

/**
 * The outcome text of every roll in the beat, at its final tier: what the
 * move asks the table to envision (D-138, amended (a) — without it, no
 * spike run brought Beat 6's survivor into the world).
 */
export function outcomeTexts(events: readonly AstrolabeEvent[]): readonly string[] {
  const burned = TIER_OF_BURN(events);
  const texts: string[] = [];
  for (const event of events) {
    if (event.type !== 'dice.rolled') {
      continue;
    }
    const invoked = events.find(
      (e) => e.type === 'move.invoked' && e.commandId === event.commandId,
    );
    if (invoked?.type !== 'move.invoked') {
      continue;
    }
    const move = STARFORGED.moves.find((m) => m.id === invoked.payload.moveId);
    const tier: OutcomeTier = burned.get(event.id) ?? event.payload.tier;
    const text = move?.outcomes?.[tier]?.text;
    if (move !== undefined && text !== undefined) {
      texts.push(`${move.name}: ${plain(text)}`);
    }
  }
  return texts;
}

export interface WorldBeat {
  readonly facts: BeatFacts;
  readonly outcomes: readonly string[];
  /** The committed passage the world pass follows. */
  readonly passage: string;
  /**
   * D-156: every earlier live passage of the current session, oldest first,
   * so the plan and interpret calls can check a new result against what an
   * NPC's own narrated words already established, not only the projected
   * state (`renderState` carries no interiority or dialogue, by design).
   * Excludes `passage` itself. Bounded to the session, the same unit the
   * recap (D-147) already treats as fully remembered; earlier sessions are
   * carried forward only through their recap, as before.
   */
  readonly recentNarration?: readonly string[];
  /** D-145: a miss, a match or a Pay the Price chain, which lets the plan set clocks. */
  readonly pressure?: boolean;
  /** D-28 (8.4): what the oracle answered the plan's questions, once rolled. */
  readonly answers?: readonly string[];
}

function beatBlock(state: CampaignState, beat: WorldBeat): string {
  return [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    ...(beat.recentNarration !== undefined && beat.recentNarration.length > 0
      ? [`<recent_narration>\n${beat.recentNarration.join('\n\n')}\n</recent_narration>`]
      : []),
    `<resolved_beat>\n${beat.facts.lines.join('\n')}\n</resolved_beat>`,
    ...(beat.outcomes.length > 0
      ? [`<outcome_text>\n${beat.outcomes.join('\n')}\n</outcome_text>`]
      : []),
    `<passage>\n${beat.passage}\n</passage>`,
    ...(beat.answers !== undefined && beat.answers.length > 0
      ? [`<oracle_answers>\n${beat.answers.join('\n')}\n</oracle_answers>`]
      : []),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * A recipe as the plan names it: its entity kind, `npc`, not its id. The
 * SDK's schema transform passes an enum to the model only as description
 * text, so the enum is not enforced while decoding (live 8.1 pass: two of
 * six plans answered something other than `recipe:npc`, twice each). The
 * plain word is the one the model writes; `recipeOf` maps it back.
 */
export function planName(recipe: OracleRecipe): string {
  return recipe.entityKind;
}

export function recipeOf(offered: readonly OracleRecipe[], name: string): OracleRecipe | undefined {
  return offered.find((recipe) => planName(recipe) === name);
}

/** An unfilled clock the plan may tick, by key (D-145). */
export interface OpenClock {
  /** `C1`, `C2`, … */
  readonly key: string;
  readonly trackId: TrackId;
  readonly title: string;
  readonly ticks: number;
  readonly maxTicks: number;
}

/**
 * D-145: present only on a pressure beat (a miss, a match or a Pay the Price
 * chain), and absent from a scene frame. Without it the plan has no clock
 * fields at all.
 */
export interface ClockOffer {
  readonly open: readonly OpenClock[];
}

/** The unfilled clocks, keyed in the order the campaign created them. */
export function openClocks(state: CampaignState): readonly OpenClock[] {
  return Object.values(state.tracks)
    .filter((track) => track.kind === 'clock' && track.ticks < track.maxTicks)
    .map((track, i) => ({
      key: `C${i + 1}`,
      trackId: track.id,
      title: track.title,
      ticks: track.ticks,
      maxTicks: track.maxTicks,
    }));
}

const CLOCK_SEGMENTS = [4, 6, 8, 10] as const;

export interface ClockCreate {
  readonly title: string;
  readonly segments: (typeof CLOCK_SEGMENTS)[number];
  readonly filled: number;
  readonly reason: string;
}

export interface ClockTick {
  readonly clock: string;
  readonly segments: number;
  readonly reason: string;
}

export interface WorldPlan {
  readonly review: string;
  readonly recipes: readonly { readonly recipe: string; readonly reason: string }[];
  readonly questions: readonly {
    readonly question: string;
    readonly odds: (typeof ORACLE_ODDS)[number];
    readonly onYes: string | null;
  }[];
  readonly clocks?: {
    readonly create: readonly ClockCreate[];
    readonly tick?: readonly ClockTick[];
  };
}

export function worldPlanSchema(
  offered: readonly OracleRecipe[],
  clocks?: ClockOffer,
): z.ZodType<WorldPlan> {
  const names = offered.map(planName) as [string, ...string[]];
  const keys = (clocks?.open ?? []).map((c) => c.key) as [string, ...string[]];
  const clockFields =
    clocks === undefined
      ? {}
      : {
          clocks: z
            .object({
              create: z
                .array(
                  z.object({
                    title: z.string().min(1).describe('What is building, in a few words.'),
                    segments: z.union(CLOCK_SEGMENTS.map((n) => z.literal(n)) as never),
                    filled: z.int().min(0).describe('Segments already filled when it is created.'),
                    reason: z.string().min(1).describe('One line: what in this beat set it going.'),
                  }),
                )
                .max(1)
                .describe('At most one new clock. Usually empty.'),
              ...(keys.length > 0
                ? {
                    tick: z
                      .array(
                        z.object({
                          clock: z.enum(keys),
                          segments: z.int().min(1),
                          reason: z
                            .string()
                            .min(1)
                            .describe('One line: why this beat advances it.'),
                        }),
                      )
                      .max(2)
                      .describe('Existing clocks this beat advances. Usually empty.'),
                  }
                : {}),
            })
            .describe('Clocks: only for a threat or pressure this beat sets building.'),
        };
  return z.object({
    review: z
      .string()
      .min(1)
      .describe(
        'One or two sentences, before deciding: what, if anything, this beat brings into the world that is not already established, and why it does or does not need a recipe.',
      ),
    recipes: z
      .array(
        z.object({
          recipe: z.enum(names),
          reason: z
            .string()
            .min(1)
            .describe('One line: what in this beat brings it into the story.'),
        }),
      )
      .max(2)
      .describe('Empty unless the beat brings something new into the world.'),
    questions: z
      .array(
        z.object({
          question: z.string().min(1).describe('A yes/no question about the world.'),
          odds: z.enum(ORACLE_ODDS),
          onYes: z
            .enum(names)
            .nullable()
            .describe(
              'A recipe to roll only if the answer is yes (D-138, amended); otherwise null.',
            ),
        }),
      )
      .max(2)
      .describe('Yes/no questions about the world for the oracle (D-28). Usually empty.'),
    ...clockFields,
  }) as unknown as z.ZodType<WorldPlan>;
}

/** D-140: a question is world text, and names no player character. */
export function checkWorldPlan(
  value: WorldPlan,
  characters: SegmentContext['characters'],
  clocks?: ClockOffer,
): string | undefined {
  for (const { question } of value.questions) {
    const named = namedCharacter(question, characters);
    if (named !== undefined) {
      return `The question "${question}" names ${named.callsign}, a player character. Ask about the world, not about a player character.`;
    }
  }
  return value.clocks === undefined ? undefined : checkClocks(value.clocks, characters, clocks);
}

/** D-145's gate and limits, and D-140's name check on clock text. */
function checkClocks(
  planned: NonNullable<WorldPlan['clocks']>,
  characters: SegmentContext['characters'],
  offer: ClockOffer | undefined,
): string | undefined {
  const tick = planned.tick ?? [];
  if (offer === undefined) {
    return planned.create.length > 0 || tick.length > 0
      ? 'Clocks are set only after a miss, a match or a Pay the Price. This beat had none: leave clocks out.'
      : undefined;
  }
  if (planned.create.length > 1) {
    return 'Create at most one clock.';
  }
  for (const clock of planned.create) {
    if (!(CLOCK_SEGMENTS as readonly number[]).includes(clock.segments)) {
      return `A clock has 4, 6, 8 or 10 segments, not ${clock.segments}.`;
    }
    if (clock.filled < 0 || clock.filled >= clock.segments) {
      return `A new clock of ${clock.segments} segments starts with 0 to ${clock.segments - 1} filled, not ${clock.filled}.`;
    }
  }
  if (tick.length > 2) {
    return 'Tick at most two clocks.';
  }
  const seen = new Set<string>();
  for (const t of tick) {
    const open = offer.open.find((c) => c.key === t.clock);
    if (open === undefined) {
      return `${t.clock} is not an open clock.`;
    }
    if (seen.has(t.clock)) {
      return `${t.clock} is ticked twice; tick it once by the segments it advances.`;
    }
    seen.add(t.clock);
    const room = open.maxTicks - open.ticks;
    if (t.segments < 1 || t.segments > room) {
      return `"${open.title}" has ${room} segment${room === 1 ? '' : 's'} left; tick it by 1 to ${room}.`;
    }
  }
  const texts = [
    ...planned.create.flatMap((c) => [c.title, c.reason]),
    ...tick.map((t) => t.reason),
  ];
  for (const text of texts) {
    const named = namedCharacter(text, characters);
    if (named !== undefined) {
      return `A clock's title or reason names ${named.callsign}, a player character. Say what builds in the world, without naming any player character.`;
    }
  }
  return undefined;
}

/**
 * D-145's rules, sent only on a pressure beat, with the clocks that can
 * still be ticked. On any other beat the plan hears nothing about clocks.
 */
export function clockSection(offer: ClockOffer): string {
  const open =
    offer.open.length === 0
      ? 'There are no open clocks.'
      : offer.open
          .map((c) => `- [${c.key}] "${c.title}": ${c.ticks} of ${c.maxTicks} segments filled`)
          .join('\n');
  return [
    'Clocks: this beat had a miss, a match or a price paid, so it may set pressure building.',
    'Create a clock only for a specific threat or pressure this beat set in motion that will build over later beats, and that nothing established already tracks. Most such beats still need no clock. A clock has 4, 6 or more segments (4 for pressure that will come to a head soon); it may start with segments filled if this beat already advanced it, and needs a one-line reason grounded in the beat.',
    'Tick an open clock only when this beat plainly advances what it tracks, by the segments it advances, with a one-line reason.',
    'Never name a player character in a clock title or reason.',
    `Open clocks you may tick:\n${open}`,
  ].join('\n');
}

/** What a yes/no roll answered, as a line of fact (D-28). A match brings the move's twist (8.4). */
export function describeAnswer(roll: {
  readonly oracleId: string;
  readonly roll: number;
  readonly rowText: string;
  readonly question?: string | undefined;
}): string {
  const odds = ORACLE_ODDS.find((o) => ODDS_ORACLES[o] === roll.oracleId) ?? 'unknown odds';
  const match = isOracleMatch(roll.roll) ? ` The roll is a match. ${ORACLE_MATCH_CLAUSE}` : '';
  return `Asked of the oracle at ${odds.replace(/_/g, ' ')} odds: ${roll.question ?? 'a question'} The answer (${roll.roll}) is ${roll.rowText}.${match}`;
}

export function buildWorldPlanRequest(
  state: CampaignState,
  beat: WorldBeat,
  offered: readonly OracleRecipe[],
  clocks?: ClockOffer,
): AiRequest {
  const recipes = offered
    .map((recipe) => `- ${planName(recipe)}: ${recipe.label} (rolls ${slotList(recipe)})`)
    .join('\n');
  return {
    purpose: 'world_plan',
    system: [{ text: WORLD_RULES }, { text: PLAN_RULES, cache: true }],
    user:
      `${beatBlock(state, beat)}\n\nRecipes you may request:\n${recipes}` +
      (clocks === undefined ? '' : `\n\n${clockSection(clocks)}`),
    effort: 'low',
  };
}

// ---------------------------------------------------------------------------
// Interpret
// ---------------------------------------------------------------------------

/**
 * One result a recipe slot holds. A slot usually holds one; a "Roll twice"
 * or an embedded "[Action] + [Theme]" row gives it several, each its own
 * entry with the same `slot` (`rollRecipe`).
 */
export interface RolledRecipeSlot {
  /** How many rerolls lie behind this result (D-69 counts per individual roll). */
  readonly rerolls: number;
  /** The result it replaced, when it came from a reroll. */
  readonly rerollOf?: EventId;
  /** `E1.role`, or `E1.role.1` and `E1.role.2` for a slot with several results. */
  readonly key: string;
  readonly slot: string;
  readonly name: boolean;
  readonly oracleId: OracleId;
  readonly roll: number;
  readonly rowText: string;
  /** Minted before the call, so the entity can cite it (D-124's device). */
  readonly eventId: EventId;
}

export interface RolledRecipe {
  /** `E1`, `E2`, … in plan order. */
  readonly instance: string;
  readonly recipe: OracleRecipe;
  readonly reason: string;
  readonly slots: readonly RolledRecipeSlot[];
  /** Results a reroll discarded, with the reason given (D-70). */
  readonly discarded?: readonly (RolledRecipeSlot & { readonly reason: string })[];
}

export function worldInterpretSchema(rolled: readonly RolledRecipe[]) {
  const instances = rolled.map((r) => r.instance) as [string, ...string[]];
  const keys = rolled.flatMap((r) => r.slots.map((s) => s.key)) as [string, ...string[]];
  const slots = [
    ...new Set(rolled.flatMap((r) => r.slots.filter((s) => !s.name).map((s) => s.slot))),
  ] as [string, ...string[]];
  return z.object({
    rerolls: z
      .array(
        z.object({
          roll: z.enum(keys),
          reason: z.string().min(1).describe('One line: what established fact it contradicts.'),
        }),
      )
      .describe('Results that contradict what is established. Empty when none do.'),
    entities: z.array(
      z.object({
        instance: z.enum(instances),
        name: z.string().min(1),
        nameCites: z.array(z.enum(keys)).describe('The name rolls the name is built from.'),
        fields: z.array(
          z.object({
            slot: z.enum(slots),
            text: z.string().min(1).describe('One or two sentences interpreting the roll.'),
            cites: z.array(z.enum(keys)),
          }),
        ),
      }),
    ),
  });
}

export type WorldInterpretation = z.infer<ReturnType<typeof worldInterpretSchema>>;

export function buildWorldInterpretRequest(
  state: CampaignState,
  beat: WorldBeat,
  rolled: readonly RolledRecipe[],
  rerollCap: number,
): AiRequest {
  const rolls = rolled
    .map(
      (r) =>
        `${r.instance}: ${r.recipe.label} (${r.recipe.id}), because ${r.reason}\n` +
        r.slots
          .map(
            (s) =>
              `  [${s.key}] ${s.slot}${s.name ? ' (name)' : ''}: ${s.rowText} (rolled ${s.roll})` +
              (s.rerolls >= rerollCap ? ' (final)' : ''),
          )
          .join('\n') +
        (r.discarded ?? [])
          .map((d) => `\n  discarded ${d.slot}: ${d.rowText}, because ${d.reason}`)
          .join(''),
    )
    .join('\n');
  return {
    purpose: 'world_interpret',
    system: [{ text: WORLD_RULES }, { text: INTERPRET_RULES, cache: true }],
    user: `${beatBlock(state, beat)}\n\n<rolls>\n${rolls}\n</rolls>\n\nAnswer one entity per recipe instance.`,
    effort: 'low',
  };
}

/**
 * What the schema can't say (D-140 and the recipe's shape): one entity per
 * rolled instance, every field slot answered once, citations only to that
 * instance's own rolls, and no player character named anywhere.
 */
export function checkWorldInterpretation(
  value: WorldInterpretation,
  rolled: readonly RolledRecipe[],
  characters: SegmentContext['characters'],
  rerollCap: number,
): string | undefined {
  if (value.rerolls.length > 0) {
    return checkRerolls(value.rerolls, rolled, characters, rerollCap);
  }
  for (const instance of rolled) {
    const answers = value.entities.filter((e) => e.instance === instance.instance);
    if (answers.length !== 1) {
      return `Answer exactly one entity for ${instance.instance}; there were ${answers.length}.`;
    }
    const entity = answers[0]!;
    const own = new Set(instance.slots.map((s) => s.key));
    const nameKeys = new Set(instance.slots.filter((s) => s.name).map((s) => s.key));

    if (
      nameKeys.size > 0 &&
      (entity.nameCites.length === 0 || entity.nameCites.some((key) => !nameKeys.has(key)))
    ) {
      return `${instance.instance}'s name must cite its own name rolls (${[...nameKeys].join(', ')}), and only those.`;
    }
    const fieldSlots = [...new Set(instance.slots.filter((s) => !s.name).map((s) => s.slot))];
    for (const slot of fieldSlots) {
      const fields = entity.fields.filter((f) => f.slot === slot);
      if (fields.length !== 1) {
        return `${instance.instance} must answer its ${slot} slot exactly once.`;
      }
      const keys = instance.slots.filter((s) => s.slot === slot).map((s) => s.key);
      if (!keys.some((key) => fields[0]!.cites.includes(key))) {
        return `${instance.instance}'s ${slot} must cite its own roll, ${keys.join(' or ')}.`;
      }
    }
    const stray = entity.fields.find(
      (f) =>
        !instance.slots.some((s) => !s.name && s.slot === f.slot) ||
        f.cites.some((k) => !own.has(k)),
    );
    if (stray !== undefined) {
      return `${instance.instance}'s ${stray.slot} is not one of its slots, or cites another entity's rolls.`;
    }
    for (const text of [entity.name, ...entity.fields.map((f) => f.text)]) {
      const named = namedCharacter(text, characters);
      if (named !== undefined) {
        return `${instance.instance} names ${named.callsign}, a player character. Describe the entity as the world holds it, without naming any player character.`;
      }
    }
  }
  const extra = value.entities.find((e) => !rolled.some((r) => r.instance === e.instance));
  return extra === undefined ? undefined : `${extra.instance} is not a rolled recipe instance.`;
}

/**
 * D-18, D-69, D-70: every named result exists, is named once, still has a
 * reroll left, and has a reason that names no player character (D-140).
 * The entities of an answer that asks for rerolls are not read.
 */
function checkRerolls(
  rerolls: WorldInterpretation['rerolls'],
  rolled: readonly RolledRecipe[],
  characters: SegmentContext['characters'],
  rerollCap: number,
): string | undefined {
  const results = new Map(rolled.flatMap((r) => r.slots.map((s) => [s.key, s] as const)));
  const seen = new Set<string>();
  for (const { roll, reason } of rerolls) {
    const result = results.get(roll);
    if (result === undefined) {
      return `${roll} is not a current result.`;
    }
    if (seen.has(roll)) {
      return `${roll} is listed twice in rerolls.`;
    }
    seen.add(roll);
    if (result.rerolls >= rerollCap) {
      return `${roll} is final: it has used its rerolls and must be interpreted as it is.`;
    }
    const named = namedCharacter(reason, characters);
    if (named !== undefined) {
      return `The reason for rerolling ${roll} names ${named.callsign}, a player character. Say what established fact it contradicts without naming any player character.`;
    }
  }
  return undefined;
}

function slotList(recipe: OracleRecipe): string {
  return recipe.rolls.map((roll) => roll.slot).join(', ');
}

function plain(text: string): string {
  return withoutLinks(text).replace(/__/g, '');
}
