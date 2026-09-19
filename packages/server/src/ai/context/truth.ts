import { STARFORGED, type SettingTruth } from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import { renderSetup } from './incident.js';

/**
 * Asking the Guide about one setting truth (task 5.3, D-162, D-166).
 *
 * **Why this proposal cites no oracle roll.** D-166 has the server roll a
 * declared recipe before the Guide interprets it, and group 1.3 declared no
 * recipe for a truth — correctly. A truth's own table *is* its enumerated
 * option set: the Guide's job is to recommend one of the three official
 * options with a stated reason, or to draft wording for the custom path, which
 * is the same authority it already has over incident text (D-168) and
 * character backstory (D-163). It produces no random result, so §4 is
 * satisfied without a roll, and a player who wants dice uses the Roll path,
 * which is authoritative and already built.
 *
 * Nothing here is canon. The player accepts, edits or ignores it, and
 * acceptance goes through the same `decideTruth` command the manual paths use
 * (D-161).
 */

const TRUTH_RULES = `You are the Guide for a game of Ironsworn: Starforged, helping a player settle one setting truth before play begins.

A setting truth answers one question about this campaign's galaxy. You are given the question, its three official options, and whatever the campaign has already established.

Recommend one of these:
- an official option, named by its index, when one fits what the campaign has already established;
- the player's own answer, as text you draft, when none of the official options fit or the campaign's established facts point somewhere else.

You never decide the truth. The player accepts, edits or discards what you propose.

Give one short reason tying your recommendation to what the campaign has already established, or saying plainly that nothing established bears on it yet. Do not invent named people, places or factions — those come from oracle rolls the player makes elsewhere. Do not contradict a truth already decided, and do not settle a truth the player deliberately left open.`;

export function buildTruthProposalRequest(state: CampaignState, truth: SettingTruth): AiRequest {
  const options = truth.rows
    .map((row, index) => `${index}. ${row.summary}\n   ${row.description}`)
    .join('\n');
  const setup = renderSetup(state);

  return {
    purpose: 'truth_proposal',
    system: [{ text: TRUTH_RULES }],
    user: [
      `<campaign>\n${setup}\n</campaign>`,
      `<truth>\n${truth.name}\n${truth.characterPrompt ?? ''}\n</truth>`,
      `<options>\n${options}\n</options>`,
      'Recommend an answer to this truth.',
    ].join('\n\n'),
    effort: 'low',
  };
}

/**
 * The shape the Guide answers in.
 *
 * `optionIndex` is bounded by the truth's own row count, so the model cannot
 * name an option that does not exist — the same trust boundary `decideTruth`
 * enforces again when the player accepts.
 */
export function truthProposalSchema(truth: SettingTruth) {
  return z.object({
    resolution: z.enum(['selected', 'custom']),
    optionIndex: z
      .int()
      .min(0)
      .max(Math.max(truth.rows.length - 1, 0))
      .optional(),
    text: z.string().min(1).max(600).optional(),
    reason: z.string().min(1).max(400),
  });
}

export type TruthProposalOutput = z.infer<ReturnType<typeof truthProposalSchema>>;

/**
 * What the schema cannot say: that the resolution and the field it needs agree.
 * Returned in words, for the re-ask.
 */
export function checkTruthProposal(
  value: TruthProposalOutput,
  truth: SettingTruth,
): string | undefined {
  if (value.resolution === 'selected') {
    if (value.optionIndex === undefined) {
      return 'A recommended official option must name its index.';
    }
    if (truth.rows[value.optionIndex] === undefined) {
      return `Option ${value.optionIndex} is not one of this truth's options.`;
    }
    return undefined;
  }
  if (value.text === undefined || value.text.trim() === '') {
    return 'A recommended custom answer must include its text.';
  }
  return undefined;
}

export function findTruth(truthId: string): SettingTruth | undefined {
  return STARFORGED.truths.find((candidate) => candidate.id === truthId);
}
