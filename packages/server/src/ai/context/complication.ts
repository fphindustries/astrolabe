import { complicationFor, type OracleId } from '@astrolabe/rules';
import type { AstrolabeEvent, CampaignState, EventId } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import type { BeatFacts } from './describe-beat.js';
import { renderState } from './render-state.js';
import { namedCharacter, type SegmentContext } from './segments.js';

/**
 * Weak-hit complication options (task 8.7; D-15, D-143). Pure, like the
 * rest of this directory. One Action + Theme pair per option (D-132's one
 * roll per option), and the options answer against the beat they
 * complicate. Not sent to D-128's checker: nothing here is canon until the
 * player picks or writes one (D-134). D-140's name check applies.
 */

export const COMPLICATION_OPTION_COUNT = 3;

const ACTION: OracleId = 'oracle:core/action';
const THEME: OracleId = 'oracle:core/theme';

export interface ComplicationRollSpec {
  /** `O1.action`, `O1.theme`, `O2.action`, … */
  readonly key: string;
  readonly option: number;
  readonly slot: 'action' | 'theme';
  readonly oracleId: OracleId;
}

export const COMPLICATION_ROLLS: readonly ComplicationRollSpec[] = Array.from(
  { length: COMPLICATION_OPTION_COUNT },
  (_, i) => [
    { key: `O${i + 1}.action`, option: i, slot: 'action' as const, oracleId: ACTION },
    { key: `O${i + 1}.theme`, option: i, slot: 'theme' as const, oracleId: THEME },
  ],
).flat();

export interface RolledComplication extends ComplicationRollSpec {
  readonly roll: number;
  readonly rowText: string;
  readonly eventId: EventId;
}

const COMPLICATION_RULES = `You run the world for a solo game of Ironsworn: Starforged. A move has just resolved, and its outcome calls for a complication the move itself does not specify. The player asked you for options.

Offer exactly three complications, one per Action + Theme pair the app rolled, each inspired by its own pair and citing both of its rolls. A complication is something about the world or the situation that makes the crew's path harder: a fact, a danger, a cost, a turn in what they found. One or two sentences each, and three genuinely different directions.

Never say what a player character does, thinks, feels or decides, and never name a player character. Do not invent named people, places or factions; a name already established may be used. Stay consistent with everything established.`;

export function buildComplicationRequest(
  state: CampaignState,
  facts: BeatFacts,
  clause: string,
  rolled: readonly RolledComplication[],
): AiRequest {
  const pairs = Array.from({ length: COMPLICATION_OPTION_COUNT }, (_, i) =>
    rolled
      .filter((r) => r.option === i)
      .map((r) => `[${r.key}] ${r.slot}: ${r.rowText} (rolled ${r.roll})`)
      .join('\n'),
  )
    .map((lines, i) => `Option ${i + 1}:\n${lines}`)
    .join('\n');
  return {
    purpose: 'complication_options',
    system: [{ text: COMPLICATION_RULES, cache: true }],
    user: [
      `<campaign_state>\n${renderState(state)}\n</campaign_state>`,
      `<resolved_beat>\n${facts.lines.join('\n')}\n</resolved_beat>`,
      `The outcome calls for a complication: "${clause}"`,
      `<rolls>\n${pairs}\n</rolls>`,
    ].join('\n\n'),
    effort: 'low',
  };
}

export function complicationOptionsSchema(rolled: readonly RolledComplication[]) {
  const keys = rolled.map((r) => r.key) as [string, ...string[]];
  return z.object({
    options: z
      .array(
        z.object({
          text: z.string().min(1).describe('One or two sentences: the complication.'),
          cites: z.array(z.enum(keys)).describe('Both rolls of this option’s own pair.'),
        }),
      )
      .describe('Exactly three, in the order of the pairs.'),
  });
}

export type ComplicationOptions = z.infer<ReturnType<typeof complicationOptionsSchema>>;

/** Three options, each citing its own pair and nothing else, distinct, naming no player character. */
export function checkComplicationOptions(
  value: ComplicationOptions,
  rolled: readonly RolledComplication[],
  characters: SegmentContext['characters'],
): string | undefined {
  if (value.options.length !== COMPLICATION_OPTION_COUNT) {
    return `Offer exactly ${COMPLICATION_OPTION_COUNT} complications; there were ${value.options.length}.`;
  }
  const texts = new Set<string>();
  for (const [i, option] of value.options.entries()) {
    const own = rolled.filter((r) => r.option === i).map((r) => r.key);
    if (
      !own.every((key) => option.cites.includes(key)) ||
      option.cites.some((k) => !own.includes(k))
    ) {
      return `Option ${i + 1} must cite its own pair, ${own.join(' and ')}, and nothing else.`;
    }
    const text = option.text.trim().toLowerCase();
    if (texts.has(text)) {
      return 'Two options say the same thing; offer three different complications.';
    }
    texts.add(text);
    const named = namedCharacter(option.text, characters);
    if (named !== undefined) {
      return `Option ${i + 1} names ${named.callsign}, a player character. Say what complicates the situation without naming any player character.`;
    }
  }
  return undefined;
}

/** A shape the dev stub can answer for any request: three options citing their pairs. */
export function stubComplicationOptions(): ComplicationOptions {
  return {
    options: Array.from({ length: COMPLICATION_OPTION_COUNT }, (_, i) => ({
      text: `Stub complication ${i + 1}: something about the situation gets harder.`,
      cites: [`O${i + 1}.action`, `O${i + 1}.theme`],
    })),
  };
}

/**
 * D-143: a move in this beat whose outcome calls for a complication has none
 * set. Beat narration refuses until it does.
 */
export function missingComplication(scopeEvents: readonly AstrolabeEvent[]): boolean {
  return scopeEvents.some((event) => {
    if (event.type !== 'move.invoked') {
      return false;
    }
    const roll = scopeEvents.find(
      (e) => e.commandId === event.commandId && e.type === 'dice.rolled',
    );
    if (roll?.type !== 'dice.rolled') {
      return false;
    }
    const burned = scopeEvents.find(
      (e) => e.type === 'momentum.burned' && e.payload.rollEventId === roll.id,
    );
    const tier = burned?.type === 'momentum.burned' ? burned.payload.tierAfter : roll.payload.tier;
    return (
      complicationFor(event.payload.moveId, tier) !== undefined &&
      !scopeEvents.some((e) => e.type === 'complication.set' && e.causedBy === event.id)
    );
  });
}
