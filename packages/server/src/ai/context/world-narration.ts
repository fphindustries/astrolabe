import type { OracleRecipe } from '@astrolabe/rules';
import type {
  AstrolabeEvent,
  CampaignSettings,
  CampaignState,
  EventId,
  PayloadFor,
} from '@astrolabe/shared';

import type { AiRequest } from '../provider.js';

import type { BeatFact, BeatFacts } from './describe-beat.js';
import { narrationBudget } from './length.js';
import { recentNarration, systemBlocks } from './prompt.js';
import { renderState } from './render-state.js';
import { renderFacts, segmentContext, segmentInstructions } from './segments.js';
import { QUESTION_RULES, WORLD_RULES, describeAnswer, planName } from './world.js';

/**
 * The two passages that narrate the world rather than a move (task 8.2):
 * the follow-up to a world pass (D-138, amended) and the scene frame
 * (D-141). Pure, like the rest of this directory.
 *
 * Both are world-only: nothing was declared, and no fact concerns a player
 * character, so every segment narrates the world (D-129, D-141).
 */

function factsOf(facts: readonly Omit<BeatFact, 'key'>[]): BeatFacts {
  const keyed = facts.map((fact, i) => ({ ...fact, key: `F${i + 1}` }));
  return {
    facts: keyed,
    lines: keyed.map((fact) => fact.text),
    declaredAction: false,
    miss: false,
    match: false,
    burned: false,
    chainedToSuffer: false,
  };
}

function humanSlot(slot: string): string {
  return slot.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// The follow-up to a world pass
// ---------------------------------------------------------------------------

/** What a world pass established, as facts: one per entity, grounded in its rolls. */
export function describeEstablished(events: readonly AstrolabeEvent[]): BeatFacts {
  return factsOf(
    events.flatMap((event): Omit<BeatFact, 'key'>[] => {
      if (event.type === 'oracle.rolled' && event.payload.question !== undefined) {
        // D-28 (8.4): an answer the oracle gave about the world.
        return [
          {
            kind: 'roll' as const,
            eventId: event.id,
            text: describeAnswer(event.payload),
            grounds: [event.id],
          },
        ];
      }
      if (event.type !== 'entity.established') {
        return [];
      }
      const { name, fields, provenance } = event.payload;
      const described = Object.entries(fields)
        .map(([slot, text]) => `${humanSlot(slot)}: ${text}`)
        .join(' ');
      return [
        {
          kind: 'entity' as const,
          eventId: event.id,
          text: `Newly established from oracle rolls, a non-player character named ${name}. ${described}`,
          grounds: provenance.groundedIn,
        },
      ];
    }),
  );
}

export function buildWorldPassageRequest(
  state: CampaignState,
  events: readonly AstrolabeEvent[],
  facts: BeatFacts,
  settings: CampaignSettings,
): AiRequest {
  const ctx = segmentContext(facts, state, settings.narrationLatitude, true);
  const budget = narrationBudget('routine', settings.narrationLength);
  const user = [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    `<recent_narration>\n${recentNarration(events)}\n</recent_narration>`,
    `<established>\n${renderFacts(ctx)}\n</established>`,
    segmentInstructions(ctx, false),
    'The world has just gained what is established above, following the last passage. ' +
      'Narrate it entering the scene: what can be seen, heard or detected of it, and what it does, as the world holds it. ' +
      'A non-player character may act and speak. Nothing is decided for the crew, and nothing they do is narrated.',
    `Write ${budget.min} to ${budget.max} words.`,
  ].join('\n\n');
  return { purpose: 'world_passage', system: systemBlocks(settings), user, effort: 'low' };
}

// ---------------------------------------------------------------------------
// The scene frame
// ---------------------------------------------------------------------------

const SCENE_PLAN_RULES = `A scene is about to be framed: its opening passage is not yet written. Decide whether the place the scene opens on should be grounded by a recipe before it is described.

Request a recipe only when the scene's place is of that kind and its condition and first looks are not already established. Otherwise answer with an empty list. Each request gives a one-line reason.

${QUESTION_RULES}`;

export function buildSceneFramePlanRequest(
  state: CampaignState,
  offered: readonly OracleRecipe[],
): AiRequest {
  const recipes = offered
    .map(
      (recipe) =>
        `- ${planName(recipe)}: ${recipe.label} (rolls ${recipe.rolls.map((r) => r.slot).join(', ')})`,
    )
    .join('\n');
  return {
    purpose: 'scene_frame_plan',
    system: [{ text: WORLD_RULES }, { text: SCENE_PLAN_RULES, cache: true }],
    user: `<campaign_state>\n${renderState(state)}\n</campaign_state>\n\nRecipes you may request:\n${recipes}`,
    effort: 'low',
  };
}

/** The scene and its place as one fact, then each grounding roll as its own. */
export function describeScene(
  state: CampaignState,
  sceneEventId: EventId,
  rolls: readonly (PayloadFor<'oracle.rolled'> & { readonly eventId: EventId })[],
): BeatFacts {
  const scene = state.scene;
  const location = scene?.locationId === undefined ? undefined : state.entities[scene.locationId];
  const where =
    location === undefined
      ? ''
      : ` It takes place at ${location.name}${Object.values(location.fields).length > 0 ? `: ${Object.values(location.fields).join(' ')}` : '.'}`;
  return factsOf([
    {
      kind: 'scene',
      eventId: sceneEventId,
      text: `The scene: ${scene?.title ?? 'untitled'}.${where}`,
    },
    ...rolls.map((roll) => ({
      kind: 'roll' as const,
      eventId: roll.eventId,
      text:
        roll.question !== undefined
          ? describeAnswer(roll)
          : `Oracle, ${roll.slot === undefined ? 'result' : humanSlot(roll.slot)} (${roll.roll}): ${roll.rowText}`,
      grounds: [roll.eventId],
    })),
  ]);
}

export function buildSceneFrameRequest(
  state: CampaignState,
  events: readonly AstrolabeEvent[],
  facts: BeatFacts,
  settings: CampaignSettings,
): AiRequest {
  const ctx = segmentContext(facts, state, settings.narrationLatitude, true);
  // D-141: a scene opening is weighted at the dramatic range; world-only
  // segments leave no room for undeclared action, which D-115's cap guards.
  const budget = narrationBudget('dramatic', settings.narrationLength);
  const user = [
    `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
    `<recent_narration>\n${recentNarration(events)}\n</recent_narration>`,
    `<scene>\n${renderFacts(ctx)}\n</scene>`,
    segmentInstructions(ctx, false),
    'Frame the opening of this scene: the place as it stands, rich with what the oracle results above give it. ' +
      'Interpret the results; do not contradict what is established. ' +
      'End on what is at stake here, without suggesting what anyone should do.',
    `Write ${budget.min} to ${budget.max} words.`,
  ].join('\n\n');
  return { purpose: 'scene_frame', system: systemBlocks(settings), user, effort: 'low' };
}
