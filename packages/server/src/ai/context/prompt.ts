import type { AstrolabeEvent, CampaignSettings, CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import { livePassages } from '../../projection/narrative-log.js';
import type { AiRequest, AiSystemBlock } from '../provider.js';

import type { BeatFacts } from './describe-beat.js';
import { LATITUDE_INSTRUCTIONS } from './latitude.js';
import { beatWeight, narrationBudget } from './length.js';
import { renderState } from './render-state.js';

/**
 * Prompt assembly (tasks 7.4, 7.6, 7.7). Pure: state and events in, an
 * `AiRequest` out, so what the AI is told is unit-testable and independent
 * of which provider hears it (§9).
 *
 * The system prompt is two blocks, both byte-stable for a campaign: the
 * Guide's standing rules, then the campaign's latitude. The cache
 * breakpoint sits after the latitude. Everything that changes per call —
 * state, recent passages, the beat — goes in the user turn, after it.
 */

/** How many recent passages the AI reads for continuity. */
export const RECENT_PASSAGES = 4;

export const GUIDE_RULES = `You are the Guide for a solo game of Ironsworn: Starforged, played through an app that tracks every rule and every number. The players make every decision for their characters. You give those decisions narrative depth and run the world around them.

What the players own, and you never decide or narrate for them: a player character's actions and intentions beyond what the player declared, their thoughts, their feelings, their vows, and how they spend resources. Describe what a player character does only as far as the declared action and the resolved outcome say.

What is already settled before you write, and you never change: which move was made, the dice, the outcome, the choices the player made, and every change to meters, momentum and tracks. Narrate those facts faithfully. Do not add mechanical consequences, and do not soften or worsen the ones given.

The world: non-player characters, places, machines and weather are yours to describe, within what has been established. Do not introduce new named characters, places or factions, and do not invent what an oracle roll would decide; if the moment calls for something new, leave it open rather than inventing it.

Do not suggest what anyone should do next, and do not end with a question to the players. End on the situation as it stands.

Write plain prose in the second or third person as the scene suggests, present tense, with no headings, lists, markdown or preamble. Refer to characters by their callsign.`;

function systemBlocks(settings: CampaignSettings): readonly AiSystemBlock[] {
  return [
    { text: GUIDE_RULES },
    { text: LATITUDE_INSTRUCTIONS[settings.narrationLatitude], cache: true },
  ];
}

function recentNarration(events: readonly AstrolabeEvent[]): string {
  const passages = livePassages(events).slice(-RECENT_PASSAGES);
  return passages.length === 0
    ? 'No narration yet this campaign.'
    : passages.map((p) => p.text).join('\n\n');
}

/** Task 7.8's request: narrate one resolved beat. */
export function buildBeatRequest(
  state: CampaignState,
  events: readonly AstrolabeEvent[],
  facts: BeatFacts,
  settings: CampaignSettings,
): AiRequest {
  const weight = beatWeight(facts);
  const budget = narrationBudget(weight, settings.narrationLength);

  const user = [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    `<recent_narration>\n${recentNarration(events)}\n</recent_narration>`,
    `<resolved_beat>\n${facts.lines.join('\n')}\n</resolved_beat>`,
    `Narrate this beat as a ${weight} moment, in ${budget.min} to ${budget.max} words.`,
  ].join('\n\n');

  return { purpose: 'beat', system: systemBlocks(settings), user, effort: 'low' };
}

/** Task 7.9's request: rewrite one passage the player flagged. */
export function buildRevisionRequest(
  state: CampaignState,
  passage: { readonly text: string; readonly note: string },
  facts: BeatFacts | undefined,
  settings: CampaignSettings,
): AiRequest {
  const user = [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    ...(facts === undefined
      ? []
      : [`<resolved_beat>\n${facts.lines.join('\n')}\n</resolved_beat>`]),
    `<passage>\n${passage.text}\n</passage>`,
    `<player_correction>\n${passage.note}\n</player_correction>`,
    'The player flagged this passage. Rewrite it so the correction holds. Change only what the correction ' +
      'requires; keep everything else — the events, their order, the length and the voice — as it was. ' +
      'Reply with the rewritten passage only.',
  ].join('\n\n');

  return { purpose: 'revision', system: systemBlocks(settings), user, effort: 'low' };
}

/** D-118's structured output: the proposed amount and its one-line reason. */
export function harmProposalSchema(range: readonly [number, number]) {
  const [low, high] = range;
  return z.object({
    amount: z
      .int()
      .min(low)
      .max(high)
      .describe(`The health change, from ${low} (major harm) to ${high} (minor harm).`),
    reason: z.string().min(1).max(200).describe('One sentence of fiction explaining the severity.'),
  });
}

/** D-118's request: propose a suffer amount from the fiction. */
export function buildHarmProposalRequest(
  state: CampaignState,
  facts: BeatFacts,
  target: {
    readonly callsign: string;
    readonly meter: string;
    readonly range: readonly [number, number];
  },
  settings: CampaignSettings,
): AiRequest {
  const [low, high] = target.range;
  const user = [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    `<resolved_beat>\n${facts.lines.join('\n')}\n</resolved_beat>`,
    `${target.callsign} is about to suffer a ${target.meter} loss. Judging only from the fiction above, ` +
      `propose how severe it is: an amount from ${high} (minor) to ${low} (major), and one sentence of ` +
      'fiction saying why. The player will adjust it before it applies.',
  ].join('\n\n');

  return { purpose: 'harm_proposal', system: systemBlocks(settings), user, effort: 'low' };
}
