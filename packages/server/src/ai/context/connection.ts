import { STARFORGED, STARTING_CONNECTION_RECIPE, type OracleId } from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import type { RolledForProposal } from './creation.js';
import { renderSetup } from './incident.js';

/**
 * Asking the Guide for the local connection's NPC (9.0c, D-167, beat 10).
 *
 * The server rolls the declared NPC recipe first, as its own command
 * (`rollLaunchRecipe`), and the Guide reads those rolls into a person: a
 * name, a role, a goal, a first look and a disposition. The rank and who
 * shares the connection are the player's, so the Guide proposes neither. The
 * context is accepted facts only, via `renderSetup` (D-161).
 *
 * Nothing here is canon, and nothing here is the connection's outcome: the
 * automatic strong hit is the rules' result, and no die is rolled for it.
 */

export interface ConnectionProposalRoll {
  readonly key: string;
  readonly label: string;
  readonly oracleId: OracleId;
  readonly slot: string;
}

/** The NPC recipe's slots as proposal keys; the slot names are the keys. */
export function connectionProposalRolls(): readonly ConnectionProposalRoll[] {
  return STARTING_CONNECTION_RECIPE.rolls.map((slot) => ({
    key: slot.slot,
    label:
      slot.label ??
      STARFORGED.oracles.find((oracle) => oracle.id === slot.oracle)?.name ??
      slot.slot,
    oracleId: slot.oracle,
    slot: slot.slot,
  }));
}

const CONNECTION_RULES = `You are the Guide for a game of Ironsworn: Starforged, helping a player establish their crew's local connection at the starting settlement before play begins.

The rules have already decided the outcome: the crew made a connection, an automatic strong hit. Nothing is rolled for it. Your job is only to read the server's oracle rolls into the person they connected with.

Propose the NPC's name from the given-name and family-name rolls, their role, their goal, the first thing the crew notices about them, and their disposition, each from its roll, adapted to the campaign. Cite the keys of the rolls each field draws on. The player chooses the connection's rank and which crew members share it; do not propose either, and do not decide what any crew member thinks or feels about this person.

Every field has a reason: one short sentence tying it to its roll or to the campaign. Give one overall reason too. The person must fit the accepted truths and the starting settlement.`;

export function buildConnectionProposalRequest(
  state: CampaignState,
  rolls: readonly RolledForProposal[],
  fields?: readonly string[],
): AiRequest {
  return {
    purpose: 'connection_proposal',
    system: [{ text: CONNECTION_RULES }],
    user: [
      `<campaign>\n${renderSetup(state)}\n</campaign>`,
      `<oracle_rolls>\n${rolls.map((r) => `- ${r.key} (${r.label}): ${r.rowText}`).join('\n')}\n</oracle_rolls>`,
      fields !== undefined && fields.length > 0
        ? `<wants_help_with>\n${fields.join(', ')}\n</wants_help_with>`
        : '',
      'Propose the local connection.',
    ]
      .filter((part) => part.length > 0)
      .join('\n\n'),
    effort: 'low',
  };
}

export function connectionProposalSchema(rollKeys: readonly string[]) {
  const reason = z.string().min(1).max(300);
  const cites = z.array(z.enum(rollKeys as [string, ...string[]]));
  const text = (max: number) =>
    z.object({ value: z.string().min(1).max(max), reason, groundedIn: cites });
  return z.object({
    npcName: text(80),
    role: text(200),
    goal: text(300),
    firstLook: text(300),
    disposition: text(200),
    reason,
  });
}

export type ConnectionProposalOutput = z.infer<ReturnType<typeof connectionProposalSchema>>;

/** What the schema cannot say: that each field cites a roll it was given. */
export function checkConnectionProposal(
  value: ConnectionProposalOutput,
  rollKeys: readonly string[],
): string | undefined {
  const known = new Set(rollKeys);
  const problems: string[] = [];
  const fields = [
    ['name', value.npcName.groundedIn],
    ['role', value.role.groundedIn],
    ['goal', value.goal.groundedIn],
    ['first look', value.firstLook.groundedIn],
    ['disposition', value.disposition.groundedIn],
  ] as const;
  for (const [field, cites] of fields) {
    if (cites.length === 0)
      problems.push(`The ${field} cites no oracle roll; ground it in one of the rolls given.`);
    for (const cite of cites)
      if (!known.has(cite))
        problems.push(`The ${field} cites "${cite}", which is not one of the rolls given.`);
  }
  return problems.length === 0 ? undefined : problems.join(' ');
}
