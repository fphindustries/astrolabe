import { STARFORGED, type MoveId } from '@astrolabe/rules';
import type { AstrolabeEvent, CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import { livePassages } from '../../projection/narrative-log.js';
import { computeVoidState, isSuppressed } from '../../projection/void-state.js';
import type { AiRequest } from '../provider.js';

import { rubricText } from './authority-rubric.js';
import { placeOf, renderState } from './render-state.js';

/**
 * "What now?" (task 9.3, A6, D-10, D-148). Pure, like the rest of this
 * directory: state in; an `AiRequest`, its schema and its check out.
 *
 * "Anchored in current state" is made checkable: the Guide is shown the
 * state it may build on as keyed anchors, and every suggestion cites at
 * least one. The anchors' text is what `actions.suggested` records.
 */

export interface Anchor {
  readonly key: string;
  readonly text: string;
}

/** How many of the open session's latest passages a suggestion may build on. */
const RECENT_PASSAGES = 4;

export function whatNowAnchors(
  state: CampaignState,
  events: readonly AstrolabeEvent[],
): readonly Anchor[] {
  const lines: string[] = [];

  if (state.scene !== null) {
    const location = placeOf(state, state.scene.locationId);
    lines.push(
      `The scene: ${state.scene.title}${location === undefined ? '' : `, at ${location.name}`}.`,
    );
  }
  for (const c of Object.values(state.characters)) {
    const impacts = Object.keys(c.impacts).map(
      (id) => STARFORGED.gameRules.impacts.find((i) => i.id === id)?.label ?? id,
    );
    lines.push(
      `${c.callsign}: health ${c.meters.health.value}, spirit ${c.meters.spirit.value}, supply ${c.meters.supply.value}, momentum ${c.momentum.value}` +
        (impacts.length > 0 ? `; ${impacts.join(', ')}` : '') +
        '.',
    );
  }
  for (const t of Object.values(state.tracks)) {
    if (t.kind === 'clock') {
      if (t.ticks < t.maxTicks) {
        lines.push(`Clock "${t.title}": ${t.ticks} of ${t.maxTicks} segments filled.`);
      }
    } else {
      lines.push(
        `${t.kind === 'vow' ? 'Vow' : 'Expedition'} (${t.rank ?? 'unranked'}) "${t.title}": ${Math.floor(t.ticks / 4)} of 10 progress boxes.`,
      );
    }
  }
  for (const e of Object.values(state.entities)) {
    if (e.kind === 'npc' || e.kind === 'faction') {
      const fields = Object.values(e.fields).join(' ');
      lines.push(`${e.name} (${e.kind})${fields.length > 0 ? `: ${fields}` : '.'}`);
    }
  }
  const lastSummary = state.canon.sessionSummaries.at(-1);
  for (const thread of lastSummary?.openThreads ?? []) {
    lines.push(`Left open last session: ${thread}`);
  }

  const sessionId = state.session?.id;
  if (sessionId !== undefined) {
    const voids = computeVoidState(events);
    const inSession = events.filter((e) => e.sessionId === sessionId && !isSuppressed(e, voids));
    for (const event of inSession) {
      if (event.type === 'complication.set') {
        lines.push(`The player set a complication: ${event.payload.text}`);
      }
    }
    for (const passage of livePassages(inSession).slice(-RECENT_PASSAGES)) {
      lines.push(`As narrated: ${passage.text}`);
    }
  }

  return lines.map((text, i) => ({ key: `A${i + 1}`, text }));
}

export const WHAT_NOW_RULES = `The players of a solo game of Ironsworn: Starforged have asked the Guide "What now?". Offer exactly three suggested actions. The players decide; they may take one, combine them, or ignore all three.

Each suggestion:
- character: the callsign of the player character best placed to act.
- actionText: one sentence of what that character could do, in the present tense, as the player might declare it ("Vesna traces the power draw with the Lantern Wake's sensors."). An action only: no thought, feeling, intent, motivation or disposition, and no outcome.
- moveId: the move that action would most likely trigger, from the moves listed, or null when it would trigger none. Any move may be named.
- reason: one short sentence on why it matters now, tied to the anchors.
- anchors: the keys of the anchors the suggestion builds on. At least one.

Make the three distinct: different directions, not three versions of one. Build only on what the anchors establish; do not invent people, places or facts. Do not narrate.

A suggested action is the player's to declare, so it is not an undeclared action. The rest of what the player owns still holds:
${rubricText(['player_interior'])}

Use a player character's pronouns only as the campaign state records them; for a character whose pronouns are not recorded, use no pronoun at all, only their callsign.`;

/** Every move, with its trigger, as the rules state it. */
function renderMoves(): string {
  return `<moves>\n${STARFORGED.moves.map((m) => `${m.id} (${m.name}): ${m.trigger.text}`).join('\n')}\n</moves>`;
}

export function buildWhatNowRequest(state: CampaignState, anchors: readonly Anchor[]): AiRequest {
  const callsigns = Object.values(state.characters).map((c) => c.callsign);
  const user = [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    `<anchors>\n${anchors.map((a) => `[${a.key}] ${a.text}`).join('\n')}\n</anchors>`,
    `Callsigns: ${callsigns.join(', ')}`,
    'What now? Offer three suggested actions.',
  ].join('\n\n');
  return {
    purpose: 'what_now',
    system: [{ text: WHAT_NOW_RULES }, { text: renderMoves(), cache: true }],
    user,
    effort: 'low',
  };
}

export function whatNowSchema(anchors: readonly Anchor[], callsigns: readonly string[]) {
  const keys = anchors.map((a) => a.key);
  return z.object({
    suggestions: z
      .array(
        z.object({
          character: callsigns.length > 0 ? z.enum(callsigns as [string, ...string[]]) : z.string(),
          actionText: z.string().min(1).max(300),
          moveId: z.enum(STARFORGED.moves.map((m) => m.id) as [MoveId, ...MoveId[]]).nullable(),
          reason: z.string().min(1).max(300),
          anchors: z.array(keys.length > 0 ? z.enum(keys as [string, ...string[]]) : z.string()),
        }),
      )
      .length(3),
  });
}

export type WhatNowOutput = z.infer<ReturnType<typeof whatNowSchema>>;

/**
 * What zod can't be trusted with (the SDK sends enums as description text,
 * 8.1's notes) and what it can't say: each character is in the crew, each
 * move exists, each suggestion cites a real anchor, and the three differ.
 */
export function checkWhatNow(
  value: WhatNowOutput,
  anchors: readonly Anchor[],
  callsigns: readonly string[],
): string | undefined {
  const problems: string[] = [];
  const texts = new Set<string>();
  value.suggestions.forEach((s, i) => {
    const n = `Suggestion ${i + 1}`;
    if (!callsigns.includes(s.character)) {
      problems.push(`${n} names ${s.character}, who is not in the crew.`);
    }
    if (s.moveId !== null && !STARFORGED.moves.some((m) => m.id === s.moveId)) {
      problems.push(`${n} names "${s.moveId}", which is not a move.`);
    }
    if (s.anchors.length === 0) {
      problems.push(`${n} cites no anchor.`);
    }
    const unknown = s.anchors.filter((key) => !anchors.some((a) => a.key === key));
    if (unknown.length > 0) {
      problems.push(
        `${n} cites ${unknown.join(', ')}, which ${unknown.length === 1 ? 'is' : 'are'} not an anchor.`,
      );
    }
    const text = s.actionText.trim().toLowerCase();
    if (texts.has(text)) {
      problems.push(`${n} repeats another suggestion.`);
    }
    texts.add(text);
  });
  return problems.length === 0 ? undefined : problems.join(' ');
}

/** The dev stub's answer: three suggestions for the first callsign, on the first anchor. */
export function stubWhatNow(user: string) {
  const character = /Callsigns: ([^,\n]+)/u.exec(user)?.[1]?.trim() ?? 'Stub';
  const action = (text: string, moveId: string | null) => ({
    character,
    actionText: `${character} ${text}`,
    moveId,
    reason: 'Stub suggestion: it follows from where the crew stands.',
    anchors: ['A1'],
  });
  return {
    suggestions: [
      action('looks around for what changed.', 'move:adventure/gather-information'),
      action('prepares for what comes next.', 'move:adventure/secure-an-advantage'),
      action('pushes on toward the goal.', 'move:exploration/undertake-an-expedition'),
    ],
  };
}
