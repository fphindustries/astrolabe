import type { CharacterId } from '@astrolabe/rules';
import type { CampaignSettings, CampaignState, EventId, PayloadFor } from '@astrolabe/shared';
import * as z from 'zod';

import type { BeatFact, BeatFacts, FactKind } from './describe-beat.js';

/**
 * Segmented beat narration (task 7.14, D-127).
 *
 * A passage is a list of segments, each saying what it is about, which
 * character it concerns, and which of the beat's facts it narrates. The
 * checks here need no AI, and they read what a segment *claims* to be: a
 * segment that says a player character acts has to cite that character's
 * declared action.
 *
 * What they cannot catch: a segment labelled as something it isn't, a
 * player-owned interior written as something that happens to the
 * character, or a player character referred to only by a pronoun in a
 * `world` segment. D-128's checker covers those. Citations are traceability,
 * not enforcement: a valid key says nothing about whether the text follows
 * from that fact.
 */

export const SEGMENT_ABOUT = [
  'world',
  'character_undergoes',
  'character_does',
  'character_says',
] as const;

export type SegmentAbout = (typeof SEGMENT_ABOUT)[number];

export interface Segment {
  readonly about: SegmentAbout;
  /** The player character's callsign, as the schema offers it. */
  readonly character: string | null;
  readonly basis: readonly string[];
  readonly text: string;
}

export interface SegmentTags {
  readonly about: SegmentAbout;
  readonly character: string | null;
  readonly basis: readonly string[];
}

export interface SegmentContext {
  readonly facts: readonly BeatFact[];
  readonly latitude: CampaignSettings['narrationLatitude'];
  readonly characters: readonly {
    readonly id: CharacterId;
    readonly callsign: string;
    readonly name: string;
  }[];
}

export function segmentContext(
  beat: BeatFacts,
  state: CampaignState,
  latitude: CampaignSettings['narrationLatitude'],
): SegmentContext {
  return {
    facts: beat.facts,
    latitude,
    characters: Object.values(state.characters).map((c) => ({
      id: c.id,
      callsign: c.callsign,
      name: c.name,
    })),
  };
}

/**
 * The structured output a beat is narrated as. `basis` and `character` are
 * enums of this beat's fact keys and the campaign's callsigns, so the
 * provider cannot cite a fact or a character that doesn't exist.
 * `character_does` and `character_says` are offered at every latitude:
 * removing a label would let the output relabel an action or a line of
 * speech as something allowed, hiding the violation instead of rejecting it.
 */
export function beatNarrationSchema(ctx: SegmentContext) {
  const keys = ctx.facts.map((fact) => fact.key);
  const callsigns = [...new Set(ctx.characters.map((c) => c.callsign))];
  const basis = keys.length > 0 ? z.enum(keys as [string, ...string[]]) : z.string();
  const character = callsigns.length > 0 ? z.enum(callsigns as [string, ...string[]]) : z.string();

  return z.object({
    segments: z
      .array(
        z.object({
          about: z.enum(SEGMENT_ABOUT).describe('What this segment narrates. Label it honestly.'),
          character: character
            .nullable()
            .describe('The player character a character_* segment concerns; null for world.'),
          basis: z.array(basis).describe('The keys of the facts this segment narrates.'),
          text: z.string().min(1).describe('One or two sentences of the passage.'),
        }),
      )
      .min(1),
  });
}

const KIND_WORDS: Readonly<Record<FactKind, string>> = {
  move: 'move',
  declared_action: 'declared action',
  roll: 'roll',
  choice: 'choice',
  effect: 'effect',
  injury: 'injury',
};

/** `[F2] (declared action, Rook) The player declared: "…"` */
export function renderFacts(ctx: SegmentContext): string {
  return ctx.facts
    .map((fact) => {
      const callsign = ctx.characters.find((c) => c.id === fact.characterId)?.callsign;
      const about =
        callsign === undefined ? KIND_WORDS[fact.kind] : `${KIND_WORDS[fact.kind]}, ${callsign}`;
      return `[${fact.key}] (${about}) ${fact.text}`;
    })
    .join('\n');
}

/**
 * How to write segments, in the words the round-20 spike tested (section 7
 * notes). The verbs in `character_undergoes` do the work: without them the
 * model labelled "Rook braces against the housing" as something Rook
 * undergoes.
 */
export function segmentInstructions(ctx: SegmentContext, declaredAction: boolean): string {
  return [
    'Write the passage as segments, one or two sentences each, labelled honestly:',
    '- world: the world, machines, places, non-player characters. Never refers to a player character, their body, gear or blood.',
    "- character_undergoes: something happens TO a player character's body or gear. The character is never the one acting in it: no verb where the character moves, braces, breathes deliberately, tests, shakes, holds, decides or reacts.",
    '- character_does: a player character acts, exactly as far as a declared-action fact says, and cites that fact. If you write the character acting beyond a declared action, it is still character_does: label it so, and it will be rejected and you will be asked again.',
    ctx.latitude === 'full_voice'
      ? '- character_says: what a player character says aloud, or their outward expression, where it fits the declared action.'
      : '- character_says: a player character speaking. This latitude does not allow it; if you write it, label it so, and it will be rejected.',
    "Each segment's basis cites the keys of the facts it narrates.",
    ...(declaredAction ? [] : ['No action was declared: there is no declared-action fact.']),
  ].join('\n');
}

/** D-127's checks on a segment's tags, which arrive before its text. The problem in words, or undefined. */
export function checkSegmentTags(tags: SegmentTags, ctx: SegmentContext): string | undefined {
  const unknown = tags.basis.filter((key) => !ctx.facts.some((fact) => fact.key === key));
  if (unknown.length > 0) {
    return `A segment cites ${unknown.join(', ')}, which ${unknown.length === 1 ? 'is' : 'are'} not a fact of this beat.`;
  }

  if (tags.about === 'world') {
    return tags.character === null
      ? undefined
      : `A world segment was tagged with ${tags.character}; a segment about a player character must say what it is.`;
  }

  const character = ctx.characters.find((c) => c.callsign === tags.character);
  if (character === undefined) {
    return tags.character === null
      ? `A ${tags.about} segment names no player character.`
      : `A segment concerns ${tags.character}, who is not a player character in this campaign.`;
  }
  const cited = ctx.facts.filter((fact) => tags.basis.includes(fact.key));

  switch (tags.about) {
    case 'character_does':
      return cited.some(
        (fact) => fact.kind === 'declared_action' && fact.characterId === character.id,
      )
        ? undefined
        : `It narrated ${character.callsign} doing something the player did not declare for ${character.callsign} in this beat.`;
    case 'character_undergoes':
      return cited.some((fact) => fact.characterId === character.id)
        ? undefined
        : `A segment about what happens to ${character.callsign} cites no fact about ${character.callsign}.`;
    case 'character_says':
      return ctx.latitude === 'full_voice'
        ? undefined
        : `It gave ${character.callsign} spoken lines or outward expression, which only Full voice allows.`;
  }
}

/**
 * D-127's checks on a segment's text, run on the text so far before any of
 * it is shown: a world segment must not name a player character, and below
 * Full voice a character segment must not quote speech.
 */
export function checkSegmentText(
  tags: SegmentTags,
  text: string,
  ctx: SegmentContext,
): string | undefined {
  if (tags.about === 'world') {
    const named = ctx.characters.find((c) => namesOf(c).some((word) => containsWord(text, word)));
    return named === undefined
      ? undefined
      : `A world segment named ${named.callsign}; what happens to a player character must be labelled as theirs.`;
  }
  if (ctx.latitude !== 'full_voice' && /["“”]/u.test(text)) {
    return `A segment about ${tags.character ?? 'a player character'} quoted speech, which only Full voice allows.`;
  }
  return undefined;
}

/** Every check, on a finished passage. */
export function checkSegments(
  segments: readonly Segment[],
  ctx: SegmentContext,
): string | undefined {
  for (const segment of segments) {
    const problem = checkSegmentTags(segment, ctx) ?? checkSegmentText(segment, segment.text, ctx);
    if (problem !== undefined) {
      return problem;
    }
  }
  return joinSegments(segments).length === 0 ? 'The passage was empty.' : undefined;
}

/** The committed passage: the segments' text, in order, as one paragraph. */
export function joinSegments(segments: readonly Pick<Segment, 'text'>[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join(' ');
}

type StoredSegment = NonNullable<PayloadFor<'narration.written'>['segments']>[number];

/** `narration.written.segments`: each basis resolved from fact keys to event ids. */
export function resolveSegments(
  segments: readonly Segment[],
  ctx: SegmentContext,
): readonly StoredSegment[] {
  return segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment) => ({
      about: segment.about,
      characterId: ctx.characters.find((c) => c.callsign === segment.character)?.id ?? null,
      basis: [
        ...new Set(
          segment.basis
            .map((key) => ctx.facts.find((fact) => fact.key === key)?.eventId)
            .filter((id): id is EventId => id !== undefined),
        ),
      ],
      text: segment.text.trim(),
    }));
}

function namesOf(character: SegmentContext['characters'][number]): readonly string[] {
  const words = `${character.name} ${character.callsign}`.match(/[\p{L}\p{N}]+/gu) ?? [];
  // Words of two letters or more, matched with their capitals: "Rook" the
  // callsign, not "rook" the bird.
  return [...new Set(words.filter((word) => word.length >= 2))];
}

function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
}
