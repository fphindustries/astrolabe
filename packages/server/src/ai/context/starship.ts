import { buildStarshipRecipe, STARFORGED, type OracleId } from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import type { RolledForProposal } from './creation.js';
import { renderSetup } from './incident.js';

/**
 * Asking the Guide for the crew's shared starship (7.0e, D-164, D-166).
 *
 * The server rolls the declared starship recipe first, as its own command
 * (`rollLaunchRecipe`, D-186's shape), and the Guide interprets those rolls:
 * it never chooses a table or a result (§4). The context is accepted facts
 * only, via `renderSetup`, so no saved draft reaches it (D-161).
 *
 * Nothing here is canon. The player accepts, edits or ignores the proposal
 * through `saveSharedStarship`, which decides whether it was edited (7.0c).
 */

export interface StarshipProposalRoll {
  readonly key: string;
  readonly label: string;
  readonly oracleId: OracleId;
}

/**
 * The recipe's slots as proposal roll keys, for one or two quirks. The slot
 * names *are* the keys, as `CHARACTER_PROPOSAL_ROLLS` does for crew (D-186).
 */
export function starshipProposalRolls(quirkCount: 1 | 2): readonly StarshipProposalRoll[] {
  return buildStarshipRecipe(quirkCount).rolls.map((slot) => ({
    key: slot.slot,
    label:
      slot.label ??
      STARFORGED.oracles.find((oracle) => oracle.id === slot.oracle)?.name ??
      slot.slot,
    oracleId: slot.oracle,
  }));
}

const STARSHIP_RULES = `You are the Guide for a game of Ironsworn: Starforged, helping a player describe their crew's shared command starship before play begins.

The ship is one vessel the whole crew shares. You propose its name, appearance, history and quirks; the player reviews each field, edits what they like, and accepts. You propose; the player decides.

Grounding: the server has rolled oracle results for the ship's name, history and quirks. Build those fields from the results. You may adapt the wording to the campaign, but each of those fields cites the keys of the rolls it draws on. Give one quirk per rolled quirk, and keep them distinct.

The appearance is not rolled: write one or two sentences on what someone notices first about the ship, drawn from its history, its quirks and what the campaign has already established.

Every field has a reason: one short sentence tying it to its roll or to the campaign. Give one overall reason too. Do not invent named people, places or factions, and do not decide what any crew member thinks or feels about the ship.`;

export function buildStarshipProposalRequest(
  state: CampaignState,
  rolls: readonly RolledForProposal[],
  fields?: readonly string[],
): AiRequest {
  return {
    purpose: 'starship_proposal',
    system: [{ text: STARSHIP_RULES }],
    user: [
      `<campaign>\n${renderSetup(state)}\n</campaign>`,
      `<oracle_rolls>\n${rolls.map((r) => `- ${r.key} (${r.label}): ${r.rowText}`).join('\n')}\n</oracle_rolls>`,
      // Field-level help (6.3's shape): the answer stays complete so the review
      // screen can show it beside what the player has; this only steers.
      fields !== undefined && fields.length > 0
        ? `<wants_help_with>\n${fields.join(', ')}\n</wants_help_with>`
        : '',
      'Propose the ship.',
    ]
      .filter((part) => part.length > 0)
      .join('\n\n'),
    effort: 'low',
  };
}

/** The shape the Guide answers in. Roll citations are keys, resolved to event ids by the command. */
export function starshipProposalSchema(rollKeys: readonly string[], quirkCount: 1 | 2) {
  const reason = z.string().min(1).max(300);
  const cites = z.array(z.enum(rollKeys as [string, ...string[]]));
  return z.object({
    name: z.object({ value: z.string().min(1).max(80), reason, groundedIn: cites }),
    appearance: z.object({ value: z.string().min(1).max(400), reason }),
    history: z.object({ value: z.string().min(1).max(600), reason, groundedIn: cites }),
    quirks: z
      .array(z.object({ value: z.string().min(1).max(300), reason, groundedIn: cites }))
      .length(quirkCount),
    reason,
  });
}

export type StarshipProposalOutput = z.infer<ReturnType<typeof starshipProposalSchema>>;

/**
 * What the schema cannot say: that each rolled field cites a roll it was
 * given, and that the quirks are distinct. Returned in words, for the re-ask.
 */
export function checkStarshipProposal(
  value: StarshipProposalOutput,
  rollKeys: readonly string[],
): string | undefined {
  const known = new Set(rollKeys);
  const problems: string[] = [];
  const grounded = [
    ['name', value.name.groundedIn],
    ['history', value.history.groundedIn],
    ...value.quirks.map((quirk, i) => [`quirk ${i + 1}`, quirk.groundedIn] as const),
  ] as const;
  for (const [field, cites] of grounded) {
    if (cites.length === 0)
      problems.push(`The ${field} cites no oracle roll; ground it in one of the rolls given.`);
    for (const cite of cites)
      if (!known.has(cite))
        problems.push(`The ${field} cites "${cite}", which is not one of the rolls given.`);
  }
  const quirks = value.quirks.map((quirk) => quirk.value.trim().toLowerCase());
  if (new Set(quirks).size !== quirks.length) problems.push('The quirks must be distinct.');
  return problems.length === 0 ? undefined : problems.join(' ');
}
