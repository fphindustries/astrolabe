import {
  CHARACTER_CREATION,
  STARFORGED,
  STARTING_STAT_ARRAY,
  validateCharacterDraft,
  type AssetId,
  type OracleId,
} from '@astrolabe/rules';
import { ChallengeRankSchema, type CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import { renderState } from './render-state.js';

/**
 * Concept-first character creation's prompt (task 3.3, D-123, D-124). Pure,
 * like the rest of this directory: campaign state, the player's concept and
 * the server's oracle results in; an `AiRequest`, its output schema and its
 * rules check out.
 */

/** The oracle tables the server rolls before asking (D-123), in roll order. */
export const CHARACTER_PROPOSAL_ROLLS: readonly {
  readonly key: string;
  readonly label: string;
  readonly oracleId: OracleId;
}[] = [
  { key: 'given-name', label: 'Given name', oracleId: 'oracle:characters/name/given' as OracleId },
  {
    key: 'family-name',
    label: 'Family name',
    oracleId: 'oracle:characters/name/family-name' as OracleId,
  },
  { key: 'callsign', label: 'Callsign', oracleId: 'oracle:characters/name/callsign' as OracleId },
  {
    key: 'backstory-1',
    label: 'Backstory prompt',
    oracleId: 'oracle:campaign-launch/backstory-prompts' as OracleId,
  },
  {
    key: 'backstory-2',
    label: 'Backstory prompt',
    oracleId: 'oracle:campaign-launch/backstory-prompts' as OracleId,
  },
];

/** A rolled result, as the prompt and the proposal command see it. */
export interface RolledForProposal {
  readonly key: string;
  readonly label: string;
  readonly rowText: string;
}

const CHOOSABLE_CATEGORIES = new Set(CHARACTER_CREATION.slots.flatMap((slot) => slot.allows));

/** Every asset a creation slot can hold: no deeds, no starship (it is granted). */
export const SELECTABLE_ASSETS = STARFORGED.assets.filter((asset) =>
  CHOOSABLE_CATEGORIES.has(asset.categoryId),
);

const SUMMARY_LENGTH = 160;

/**
 * One line per asset. The full catalogue with every ability is ~115KB; the
 * first ability, cut short, tells the AI what an asset is for, which is all
 * a proposal needs. The player sees the whole card in the picker.
 */
export function renderAssetCatalogue(): string {
  return SELECTABLE_ASSETS.map((asset) => {
    const first = asset.abilities[0]?.text ?? '';
    const plain = first
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    const summary =
      plain.length > SUMMARY_LENGTH ? `${plain.slice(0, SUMMARY_LENGTH - 1).trimEnd()}…` : plain;
    return `${asset.id} | ${asset.name} | ${asset.categoryId} | ${summary}`;
  }).join('\n');
}

export const CREATION_RULES = `You help a player create a character for Ironsworn: Starforged. The player describes the character they want; you propose a complete starting build that they will review, edit and accept. You propose; the player decides. Nothing you write is final.

The build:
- Stats: edge, heart, iron, shadow and wits take the values ${STARTING_STAT_ARRAY.join(', ')}, one value each, in whatever order fits the concept. That is exactly ${describeStatArray()}; check the count before answering.
- Assets: exactly three. Two must be paths. The third may be a module, support vehicle, companion or another path. Never a deed. The crew's starship is granted separately and does not count. Use only asset ids from the catalogue.
- A background vow: one sentence the character has sworn, with a challenge rank (troublesome, dangerous, formidable, extreme or epic).
- A name, a callsign, and two or three backstory hooks.

Grounding: the server has rolled oracle results for the name, callsign and backstory. Build the name, callsign and hooks from those results. You may choose between them, combine them or adapt them to the concept, and the player's own words take precedence where they already give a name. List, for each of those fields, the keys of the rolls you drew on. Every hook cites at least one roll. A name or callsign the player already wrote in the concept is kept exactly as written and cites none. Do not invent other named people, places or factions.

Every field has a reason: one short sentence tying it to the concept or the roll. Keep the player's concept at the centre; do not decide the character's feelings or inner life beyond what the player described.`;

/** Task 3.3's request. */
export function buildCharacterProposalRequest(
  state: CampaignState,
  concept: string,
  rolls: readonly RolledForProposal[],
): AiRequest {
  const context = renderState(state);
  const user = [
    context.length > 0 ? `<campaign>\n${context}\n</campaign>` : '',
    `<oracle_rolls>\n${rolls.map((r) => `- ${r.key} (${r.label}): ${r.rowText}`).join('\n')}\n</oracle_rolls>`,
    `<concept>\n${concept}\n</concept>`,
    'Propose the build.',
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  return {
    purpose: 'character_proposal',
    system: [
      { text: CREATION_RULES },
      { text: `<asset_catalogue>\n${renderAssetCatalogue()}\n</asset_catalogue>`, cache: true },
    ],
    user,
    effort: 'medium',
  };
}

const assetIdEnum = () =>
  z.enum(SELECTABLE_ASSETS.map((asset) => asset.id) as [AssetId, ...AssetId[]]);

/** The shape the AI answers in. Roll citations are keys, resolved to event ids by the command. */
export function characterProposalSchema(rollKeys: readonly string[]) {
  const reason = z.string().min(1).max(300);
  const cites = z.array(z.enum(rollKeys as [string, ...string[]]));
  const stat = z.int().min(1).max(3);
  return z.object({
    name: z.object({ value: z.string().min(1).max(80), reason, groundedIn: cites }),
    callsign: z.object({ value: z.string().min(1).max(40), reason, groundedIn: cites }),
    stats: z.object({
      value: z.object({ edge: stat, heart: stat, iron: stat, shadow: stat, wits: stat }),
      reason,
    }),
    assets: z.array(z.object({ assetId: assetIdEnum(), reason })).length(3),
    backgroundVow: z.object({
      title: z.string().min(1).max(200),
      rank: ChallengeRankSchema,
      reason,
    }),
    hooks: z
      .array(z.object({ text: z.string().min(1).max(300), reason, groundedIn: cites }))
      .min(2)
      .max(3),
  });
}

export type CharacterProposalOutput = z.infer<ReturnType<typeof characterProposalSchema>>;

/**
 * What the schema can't say: the creation rules themselves, and that the
 * fields D-123 grounds actually cite a roll. A name or callsign the player
 * already wrote into the concept needs no roll: their words come first.
 * Returns the problems in words, for the re-ask, or undefined.
 */
export function checkCharacterProposal(
  value: CharacterProposalOutput,
  rollKeys: readonly string[],
  concept: string,
): string | undefined {
  const problems: string[] = validateCharacterDraft(
    {
      name: value.name.value,
      callsign: value.callsign.value,
      stats: value.stats.value,
      assets: value.assets.map((a) => a.assetId),
    },
    STARFORGED,
  ).map((problem) => problem.message);

  const known = new Set(rollKeys);
  // Every word of the value is a whole word of the concept: "Tomas Abara"
  // is the player's own from `Tomas "Rust" Abara`, but "Ace" is not found
  // inside "spacer", and a one-letter value cannot slip its grounding.
  const conceptWords = new Set(wordsOf(concept));
  const inConcept = (text: string) => {
    const words = wordsOf(text);
    return words.join('').length >= 2 && words.every((word) => conceptWords.has(word));
  };
  const grounded = [
    ['name', value.name.groundedIn, inConcept(value.name.value)],
    ['callsign', value.callsign.groundedIn, inConcept(value.callsign.value)],
    ...value.hooks.map((hook, i) => [`hook ${i + 1}`, hook.groundedIn, false] as const),
  ] as const;
  for (const [field, cites, playerWrote] of grounded) {
    if (cites.length === 0 && !playerWrote) {
      problems.push(`The ${field} cites no oracle roll; ground it in one of the rolls given.`);
    }
    for (const cite of cites) {
      if (!known.has(cite)) {
        problems.push(`The ${field} cites "${cite}", which is not one of the rolls given.`);
      }
    }
  }

  return problems.length === 0 ? undefined : problems.join(' ');
}

/**
 * "1 stat at 3, 2 stats at 2, 2 stats at 1", from the rules data. Found
 * live: stated only as a list, the AI often gave a third stat a 2.
 */
function describeStatArray(): string {
  const counts = new Map<number, number>();
  for (const value of STARTING_STAT_ARRAY) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => `${count} ${count === 1 ? 'stat' : 'stats'} at ${value}`)
    .join(', ');
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
