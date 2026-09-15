import type { CampaignSettings, CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import { rubricText, NARRATOR_RULES } from './authority-rubric.js';
import type { BeatFacts } from './describe-beat.js';
import { renderState } from './render-state.js';
import { namedCharacter, type SegmentContext } from './segments.js';

/**
 * End a Session's proposal (task 9.4, A17, D-149). Pure, like the rest of
 * this directory.
 *
 * Its facts are the recap's read (D-147) over the session that is ending:
 * its significant, non-voided events, so the next recap retells a summary
 * built from the same kind of record it is built from itself.
 */

/** D-149's summary weight: longer than a routine beat, shorter than a scene opening. */
export const SUMMARY_WORDS = { min: 80, max: 150 } as const;

export const SUMMARY_RULES = `A session of Ironsworn: Starforged is ending. Write the record the next session's recap will be built from.

Answer with:
- summary: ${SUMMARY_WORDS.min} to ${SUMMARY_WORDS.max} words, past tense, of what happened this session, from the facts given: what the crew did, what they found, who they met, what pressed on them, and where it left them. Build only on the facts; do not invent.
- openThreads: 2 to 5 open threads, each one short line: a question or a situation about the world, a non-player character, a clock or a vow that the session left unresolved ("the survivor's intent", "the failing power", "where the recorder is"). Never a player character's intent, feeling or plan, and never a player character's name.

The players own their characters:
${rubricText(NARRATOR_RULES)}
In a summary, a player character did only what a declared action in the facts says.

Use a player character's pronouns only as the campaign state records them; for a character whose pronouns are not recorded, use no pronoun at all, only their name or callsign.`;

export function buildSessionSummaryRequest(
  state: CampaignState,
  facts: BeatFacts,
  settings: CampaignSettings,
): AiRequest {
  const user = [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    `<this_session>\n${facts.lines.map((line) => `- ${line}`).join('\n')}\n</this_session>`,
    `Latitude: ${settings.narrationLatitude}. Summarise the session and list its open threads.`,
  ].join('\n\n');
  return {
    purpose: 'session_summary',
    system: [{ text: SUMMARY_RULES, cache: true }],
    user,
    effort: 'low',
  };
}

export function sessionSummarySchema() {
  return z.object({
    summary: z.string().min(1).max(2000),
    openThreads: z.array(z.string().min(1).max(200)).min(2).max(5),
  });
}

export type SessionSummaryOutput = z.infer<ReturnType<typeof sessionSummarySchema>>;

/**
 * What the schema can't say: 2 to 5 threads (the SDK drops `minItems` past
 * one and `maxItems` entirely, 8.1's notes), distinct, and none naming a
 * player character (D-140's check, applied to the threads as D-149 says).
 */
export function checkSessionSummary(
  value: SessionSummaryOutput,
  characters: SegmentContext['characters'],
): string | undefined {
  const threads = value.openThreads.map((t) => t.trim()).filter((t) => t.length > 0);
  if (threads.length < 2 || threads.length > 5) {
    return `Give 2 to 5 open threads, not ${threads.length}.`;
  }
  if (new Set(threads.map((t) => t.toLowerCase())).size !== threads.length) {
    return 'Two open threads repeat each other.';
  }
  for (const thread of threads) {
    const named = namedCharacter(thread, characters);
    if (named !== undefined) {
      return `The open thread "${thread}" names ${named.callsign}; a thread is about the world, not a player character.`;
    }
  }
  return value.summary.trim().length === 0 ? 'The summary is empty.' : undefined;
}

export function stubSessionSummary(): SessionSummaryOutput {
  return {
    summary: 'Stub summary: the session played out as the log records it.',
    openThreads: [
      'Stub thread: what waits deeper in.',
      'Stub thread: what the Guide set in motion.',
    ],
  };
}
