import {
  MOVE_AUTOMATION_SPECS,
  STARFORGED,
  isMoveRelevant,
  isVerbatimClause,
  type Move,
  type MoveId,
} from '@astrolabe/rules';
import { SuggestionConfidenceSchema, type CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import { renderState } from './render-state.js';

/**
 * The AI move suggestion's prompt and check (task 7.12, D-14, D-120,
 * D-135). Pure, like the rest of this directory: state, the actor and the
 * player's words in; an `AiRequest`, its schema and its check out.
 */

const NOT_SUGGESTED: ReadonlySet<MoveId> = new Set(['move:fate/pay-the-price' as MoveId]);

/**
 * D-135's candidates: moves the composer can play from a described action.
 * Automated (so the composer runs them) and in the relevant-moves panel,
 * minus session moves and Pay the Price, which is reached only by a chain.
 */
export const SUGGESTABLE_MOVES: readonly Move[] = STARFORGED.moves.filter(
  (move) =>
    MOVE_AUTOMATION_SPECS.has(move.id) &&
    isMoveRelevant(move, new Set(), undefined) &&
    move.category !== 'session' &&
    !NOT_SUGGESTED.has(move.id),
);

/** What a roll option is called in the answer: the stat or meter's own id. */
export const ROLL_OPTION_IDS = [
  'edge',
  'heart',
  'iron',
  'shadow',
  'wits',
  'health',
  'spirit',
  'supply',
] as const;
export type RollOptionId = (typeof ROLL_OPTION_IDS)[number];

const STATS: ReadonlySet<string> = new Set(['edge', 'heart', 'iron', 'shadow', 'wits']);

/** The move's stat and meter options, each with the condition text it sits under, if any. */
export function rollOptionsOf(move: Move): readonly {
  readonly id: RollOptionId;
  readonly conditionText?: string;
  readonly method: string | null;
}[] {
  return move.trigger.conditions.flatMap((condition) =>
    condition.rollOptions.flatMap((option) => {
      const id =
        option.using === 'stat'
          ? option.stat
          : option.using === 'condition_meter'
            ? option.meter
            : undefined;
      return id === undefined
        ? []
        : [
            {
              id: id as RollOptionId,
              method: condition.method,
              ...(condition.text !== undefined ? { conditionText: condition.text } : {}),
            },
          ];
    }),
  );
}

/** The roll option as `move.suggested` and `move.invoked` spell it. */
export function rollUsing(id: RollOptionId) {
  return STATS.has(id)
    ? { using: 'stat' as const, stat: id as 'edge' | 'heart' | 'iron' | 'shadow' | 'wits' }
    : { using: 'condition_meter' as const, meter: id as 'health' | 'spirit' | 'supply' };
}

export const SUGGESTION_RULES = `You help a player of Ironsworn: Starforged find the move that fits what their character does. The player has described an action without choosing a move. You suggest one; the player decides whether to use it, and they can always pick a different move themselves.

Answer with:
- moveId: the candidate move whose trigger the described action meets, or null when none of them fits. An action that carries no risk and no uncertainty may need no move at all; say so rather than forcing one.
- rollOption: when the move offers a choice of stat, the one the described action is done with, judged from its condition text. Null when the move has no roll or no choice to make.
- triggerText: the words of the rules your judgement rests on, copied exactly: a phrase from the move's trigger, or the chosen option's condition text. At least a few words, character for character, without the surrounding quotation marks. Null when moveId is null.
- reason: one short sentence tying the player's own words to that trigger. When moveId is null, why nothing fits.
- confidence: high when the action plainly meets the trigger, medium when it is a reasonable reading, low when it is a stretch.

Judge only the action as the player wrote it. Do not add to it: no further step, no intent, no feeling the player did not state. Do not narrate what happens.

Use a player character's pronouns only as the campaign state records them; for a character whose pronouns are not recorded, use no pronoun at all, only their name or callsign.`;

/** Task 7.12's request. */
export function buildMoveSuggestionRequest(
  state: CampaignState,
  actor: { readonly name: string; readonly callsign: string },
  actionText: string,
): AiRequest {
  // The crew line says when pronouns are not recorded (D-131).
  const context = renderState(state);
  const user = [
    context.length > 0 ? `<campaign>\n${context}\n</campaign>` : '',
    `<acting>${actor.name}, called ${actor.callsign}</acting>`,
    `<action>\n${actionText}\n</action>`,
    'Suggest the move.',
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  return {
    purpose: 'move_suggestion',
    system: [{ text: SUGGESTION_RULES }, { text: renderCandidates(), cache: true }],
    user,
    effort: 'low',
  };
}

/** Each candidate with its trigger and roll options, as the rules state them. */
export function renderCandidates(): string {
  const lines = SUGGESTABLE_MOVES.map((move) => {
    const options = rollOptionsOf(move).map(
      (option) =>
        `  - ${option.id}${option.conditionText !== undefined ? `: ${option.conditionText}` : ''}`,
    );
    return [
      `${move.id} (${move.name})`,
      `  Trigger: ${move.trigger.text}`,
      ...(options.length > 0
        ? ['  Roll options:', ...options.map((line) => `  ${line}`)]
        : ['  No roll options.']),
    ].join('\n');
  });
  return `<candidate_moves>\n${lines.join('\n\n')}\n</candidate_moves>`;
}

export function moveSuggestionSchema() {
  return z.object({
    moveId: z.enum(SUGGESTABLE_MOVES.map((move) => move.id) as [MoveId, ...MoveId[]]).nullable(),
    rollOption: z.enum(ROLL_OPTION_IDS).nullable(),
    triggerText: z.string().max(300).nullable(),
    reason: z.string().min(1).max(300),
    confidence: SuggestionConfidenceSchema,
  });
}

export type MoveSuggestionOutput = z.infer<ReturnType<typeof moveSuggestionSchema>>;

/** A quote shorter than this could match almost anything; the rules' shortest condition text is longer. */
const MIN_QUOTE = 12;

/**
 * What the schema can't say (D-120, D-135): the roll option belongs to the
 * move, and the quote is verbatim in that move's trigger text or the chosen
 * option's condition text. Returns the problems in words, for the re-ask,
 * or undefined.
 */
export function checkMoveSuggestion(value: MoveSuggestionOutput): string | undefined {
  if (value.moveId === null) {
    return value.rollOption !== null || value.triggerText !== null
      ? 'With no move suggested, rollOption and triggerText must both be null.'
      : undefined;
  }
  const move = SUGGESTABLE_MOVES.find((m) => m.id === value.moveId);
  if (move === undefined) {
    return `"${value.moveId}" is not one of the candidate moves.`;
  }

  const problems: string[] = [];
  const options = rollOptionsOf(move);
  const chosen = options.find((option) => option.id === value.rollOption);
  if (value.rollOption !== null && chosen === undefined) {
    problems.push(
      `${move.name} cannot be rolled with ${value.rollOption}; its options are ${options.map((o) => o.id).join(', ') || 'none'}.`,
    );
  }
  const choosable = new Set(options.filter((o) => o.method === 'player_choice').map((o) => o.id));
  if (value.rollOption === null && choosable.size > 1) {
    problems.push(`${move.name} needs a roll option: choose one of ${[...choosable].join(', ')}.`);
  }

  const quote = value.triggerText?.trim() ?? '';
  const sources = [
    move.trigger.text,
    ...(chosen?.conditionText !== undefined ? [chosen.conditionText] : []),
  ];
  if (quote.length < MIN_QUOTE) {
    problems.push(
      `Quote at least ${MIN_QUOTE} characters of ${move.name}'s trigger text as triggerText.`,
    );
  } else if (!sources.some((source) => isVerbatimClause(quote, source))) {
    problems.push(
      `The triggerText "${quote}" is not in ${move.name}'s trigger${chosen?.conditionText !== undefined ? ' or the chosen option’s condition' : ''}; copy the words exactly.`,
    );
  }

  return problems.length === 0 ? undefined : problems.join(' ');
}
