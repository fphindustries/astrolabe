import type { AuthorityRule, CampaignSettings, PayloadFor } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import { latitudeVoice, rubricText, type AuthorityRuleId } from './authority-rubric.js';
import type { Segment } from './segments.js';

/**
 * D-128's checker: what it is asked, the shape it answers in, and the
 * server's own check that every quote it gives is really there.
 *
 * It judges D-129's rules and D-130's injury, and nothing else. Every rule
 * added here costs precision, and a false positive pauses play.
 */

export type Violation = PayloadFor<'narration.withdrawn'>['violations'][number];

export interface CheckSubject {
  readonly role: 'beat' | 'revision' | 'injury' | 'summary';
  /** The whole text: a passage, a rewrite, or an injury sentence. */
  readonly text: string;
  /** A beat passage's tagged segments (D-127). */
  readonly segments?: readonly Segment[];
}

export interface CheckContext {
  readonly latitude: CampaignSettings['narrationLatitude'];
  readonly characters: readonly { readonly callsign: string; readonly name: string }[];
  /** The beat's facts, keyed or plain, when there is a beat. */
  readonly facts?: string;
}

const CHECKED_RULES: readonly AuthorityRuleId[] = [
  'undeclared_action',
  'player_interior',
  'voice',
  'injury',
];

export const CHECKER_INSTRUCTIONS = `You check text written by the Guide of a Starforged game against the players' authority over their characters. The players decide everything their characters do, think and feel; the Guide narrates what the player declared, what the dice and rules resolved, and the world around them.

Judge only these rules:
${rubricText(CHECKED_RULES)}

How to check, before you answer:
1. Find every place a player character is the one doing something: moving, bracing, breathing deliberately, testing, shaking, holding, pulling, walking, deciding, reacting. Each one is allowed only if a declared action in the resolved beat covers it, as that action or its direct physical execution in the moment. With no declared action, none is allowed.
2. Find every word about a player character's thoughts, feelings, intent, motives, habits, past, or how they usually respond.
3. Find every line a player character speaks and every outward expression (a grimace, a look, a muttered word), and compare it with the latitude.
4. When the beat states an established injury, compare the wound in the text with it.
Write these notes in "review", briefly, then list the violations.

Not violations:
- Sensations, wounds and bodily states in this beat that follow from the resolved facts ("the burn stings", "the arm still answers").
- Anything the world, machines or non-player characters do or say.
- Style, tone, invented scenery, or detail you would have written differently.

Quote the shortest span that shows each violation, copied character for character from the text, and give the segment number it is in when the text is in segments. Name the player character by callsign. Report every violation you find and nothing else; if there are none, return an empty list.`;

export function authorityCheckSchema(ctx: CheckContext) {
  const callsigns = [...new Set(ctx.characters.map((c) => c.callsign))];
  const character = callsigns.length > 0 ? z.enum(callsigns as [string, ...string[]]) : z.string();
  return z.object({
    /** The checker's working, before its verdict: a small model judges better having written it (7.15 eval). */
    review: z.string().max(2000),
    violations: z.array(
      z.object({
        rule: z.enum(['undeclared_action', 'player_interior', 'voice', 'injury']),
        character: character.nullable(),
        segment: z.int().nonnegative().nullable(),
        quote: z.string().min(1),
        why: z.string().min(1).max(300),
      }),
    ),
  });
}

export type CheckerAnswer = z.infer<ReturnType<typeof authorityCheckSchema>>;

export function buildAuthorityCheckRequest(ctx: CheckContext, subject: CheckSubject): AiRequest {
  const crew = ctx.characters.map((c) => `- ${c.callsign} (${c.name})`).join('\n');
  const text =
    subject.segments === undefined
      ? `<text>\n${subject.text}\n</text>`
      : `<segments>\n${subject.segments
          .map(
            (s, i) =>
              `[${i}] (${s.about}${s.character === null ? '' : `, ${s.character}`}) ${s.text}`,
          )
          .join('\n')}\n</segments>`;
  const what =
    subject.role === 'injury'
      ? 'The text is an injury the Guide proposes for a player character. It must describe only what happens to the character, never anything they do, think or feel.'
      : subject.role === 'revision'
        ? 'The text is a rewrite of a passage the player flagged.'
        : subject.role === 'summary'
          ? 'The text is the Guide’s summary of a session that is ending, retelling what the facts above record. A player character may do only what a declared action in them says.'
          : subject.segments === undefined
            ? 'The text is the passage narrating the beat.'
            : 'The text is the passage narrating the beat, in labelled segments. Judge the words, whatever a segment is labelled.';

  const user = [
    latitudeVoice(ctx.latitude),
    `<player_characters>\n${crew}\n</player_characters>`,
    ...(ctx.facts === undefined
      ? []
      : subject.role === 'summary'
        ? [`<session>\n${ctx.facts}\n</session>`]
        : [`<resolved_beat>\n${ctx.facts}\n</resolved_beat>`]),
    text,
    what,
  ].join('\n\n');

  return {
    purpose: 'narration_check',
    system: [{ text: CHECKER_INSTRUCTIONS, cache: true }],
    user,
    effort: 'low',
  };
}

/**
 * Every quote has to appear, exactly, where the checker says it is. A
 * verdict that can't be verified is re-asked once, then fails closed.
 */
export function verifyQuotes(answer: CheckerAnswer, subject: CheckSubject): string | undefined {
  for (const [n, violation] of answer.violations.entries()) {
    const segments = subject.segments;
    const within =
      violation.segment === null || segments === undefined
        ? subject.text
        : segments[violation.segment]?.text;
    if (within === undefined) {
      return `Violation ${n + 1} names segment ${violation.segment}, which does not exist.`;
    }
    if (!within.includes(violation.quote)) {
      return (
        `Violation ${n + 1}'s quote "${violation.quote}" does not appear verbatim in ` +
        `${violation.segment === null || segments === undefined ? 'the text' : `segment ${violation.segment}`}. ` +
        'Copy quotes exactly, or leave out a violation you cannot quote.'
      );
    }
  }
  return undefined;
}

export function toViolations(answer: CheckerAnswer): readonly Violation[] {
  return answer.violations.map((v) => ({
    rule: v.rule satisfies AuthorityRule,
    character: v.character,
    segment: v.segment,
    quote: v.quote,
    why: v.why,
  }));
}

/** The re-ask's words: what broke which rule, quoted (D-128). */
export function violationsProblem(violations: readonly Violation[]): string {
  return (
    "It broke the players' authority: " +
    violations
      .map((v) =>
        v.rule === 'segment_check' || v.quote.length === 0
          ? v.why
          : `"${v.quote}" (${RULE_NAMES[v.rule]}: ${v.why})`,
      )
      .join('; ')
  );
}

const RULE_NAMES: Readonly<Record<AuthorityRule, string>> = {
  undeclared_action: 'undeclared action',
  player_interior: 'player-owned interior',
  voice: 'voice',
  injury: 'established injury',
  segment_check: 'segment check',
  unchecked: 'unchecked',
};
