import {
  buildPlanetRecipe,
  buildSettlementRecipe,
  buildStartingSettlementRecipe,
  PLANET_CLASS_RECIPE,
  PLANET_CLASSES,
  planetClassFromRow,
  SECTOR_NAME_RECIPE,
  SECTOR_TROUBLE_RECIPE,
  settlementLocationFromRow,
  STARFORGED,
  type LaunchRegion,
  type OracleId,
  type OracleRecipeSlot,
  type PlanetClass,
} from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';
import * as z from 'zod';

import type { AiRequest } from '../provider.js';

import type { RolledForProposal } from './creation.js';
import { renderSetup } from './incident.js';

/**
 * Asking the Guide for a settlement or a trouble (8.0e, D-166, D-196).
 *
 * The server rolls the declared recipes first, each as its own command
 * (`rollLaunchRecipe`, D-186's shape), and the Guide interprets those rolls:
 * it never chooses a table or a result (§4). Where a roll *is* the answer — a
 * settlement's location, a planet's class — the Guide may not contradict it,
 * and `checkSettlementProposal` refuses an answer that does. The context is
 * accepted facts only, via `renderSetup`, so no saved draft reaches it (D-161).
 *
 * Nothing here is canon. The player accepts, edits or discards each field.
 */

export interface SectorProposalRoll {
  readonly key: string;
  readonly label: string;
  readonly oracleId: OracleId;
  readonly slot: string;
}

const toRoll =
  (rename?: (slot: string) => string) =>
  (slot: OracleRecipeSlot): SectorProposalRoll => ({
    key: rename === undefined ? slot.slot : rename(slot.slot),
    // The recipe's own slot name, which a renamed key no longer says (8.5).
    slot: slot.slot,
    label:
      slot.label ??
      STARFORGED.oracles.find((oracle) => oracle.id === slot.oracle)?.name ??
      slot.slot,
    oracleId: slot.oracle,
  });

/** What a settlement proposal is grounded in, beyond the settlement recipe itself. */
export interface SettlementProposalShape {
  readonly region: LaunchRegion;
  readonly projectCount: 1 | 2;
  /** The rolled planet's class, when a planet was rolled for it. */
  readonly planetClass?: PlanetClass;
  /** How many first looks were rolled; the starting settlement only (beat 9). */
  readonly firstLookCount?: 1 | 2;
}

/**
 * The rolls a settlement proposal cites, as proposal keys.
 *
 * The settlement recipe's slots keep their names. The planet's two recipes
 * both have slots that would collide with the settlement's own (`name`), so
 * they are prefixed; the starting-settlement recipe contributes only its
 * first looks, because its trouble is a trouble proposal's (D-194).
 */
export function settlementProposalRolls(
  shape: SettlementProposalShape,
): readonly SectorProposalRoll[] {
  return [
    ...buildSettlementRecipe(shape.region, shape.projectCount).rolls.map(toRoll()),
    ...(shape.planetClass === undefined
      ? []
      : [
          ...PLANET_CLASS_RECIPE.rolls.map(toRoll(() => 'planet_class')),
          ...buildPlanetRecipe(shape.planetClass, 'shallow').rolls.map(toRoll(() => 'planet_name')),
        ]),
    ...(shape.firstLookCount === undefined
      ? []
      : buildStartingSettlementRecipe(shape.firstLookCount)
          .rolls.filter((slot) => slot.slot !== 'trouble')
          .map(toRoll())),
  ];
}

const SETTLEMENT_RULES = `You are the Guide for a game of Ironsworn: Starforged, helping a player establish a settlement in their starting sector before play begins.

You propose the settlement's name, location, population, authority and projects; the player reviews each field, edits what they like, and accepts. You propose; the player decides.

Grounding: the server has rolled oracle results for this settlement. Build each field from its result, adapting the wording to the campaign, and cite the keys of the rolls it draws on. Give one project per rolled project.

Two results are not yours to reinterpret. The location is exactly the rolled location (planetside, orbital or deep_space). If a planet was rolled, its class is exactly the rolled class; give the planet a name from its name roll. If no planet was rolled, propose none.

If first looks were rolled, this is the starting settlement: give one first look per roll, describing what the crew notices on arrival.

Every field has a reason: one short sentence tying it to its roll or to the campaign. Give one overall reason too. The settlement must fit the accepted truths and must not duplicate a settlement the sector already has. Do not invent named people or factions, and do not decide what any crew member thinks or feels.`;

export function buildSettlementProposalRequest(
  state: CampaignState,
  rolls: readonly RolledForProposal[],
  fields?: readonly string[],
): AiRequest {
  return {
    purpose: 'settlement_proposal',
    system: [{ text: SETTLEMENT_RULES }],
    user: [
      `<campaign>\n${renderSetup(state)}\n</campaign>`,
      `<oracle_rolls>\n${rolls.map((r) => `- ${r.key} (${r.label}): ${r.rowText}`).join('\n')}\n</oracle_rolls>`,
      // Field-level help (6.3's shape): the answer stays complete; this only steers.
      fields !== undefined && fields.length > 0
        ? `<wants_help_with>\n${fields.join(', ')}\n</wants_help_with>`
        : '',
      'Propose the settlement.',
    ]
      .filter((part) => part.length > 0)
      .join('\n\n'),
    effort: 'low',
  };
}

/** The shape the Guide answers in. Roll citations are keys, resolved to event ids by the command. */
export function settlementProposalSchema(
  rollKeys: readonly string[],
  shape: SettlementProposalShape,
) {
  const reason = z.string().min(1).max(300);
  const cites = z.array(z.enum(rollKeys as [string, ...string[]]));
  const text = (max: number) =>
    z.object({ value: z.string().min(1).max(max), reason, groundedIn: cites });
  return z.object({
    name: text(80),
    location: z.object({
      value: z.enum(['planetside', 'orbital', 'deep_space']),
      reason,
      groundedIn: cites,
    }),
    population: text(200),
    authority: text(200),
    projects: z.array(text(300)).length(shape.projectCount),
    planet:
      shape.planetClass === undefined
        ? z.null()
        : z.object({
            planetClass: z.object({ value: z.enum(PLANET_CLASSES), reason, groundedIn: cites }),
            name: text(80),
          }),
    firstLooks:
      shape.firstLookCount === undefined
        ? z.null()
        : z.array(text(300)).length(shape.firstLookCount),
    reason,
  });
}

export type SettlementProposalOutput = z.infer<ReturnType<typeof settlementProposalSchema>>;

/**
 * What the schema cannot say, in words for the re-ask: that each field cites
 * a roll it was given, and that the location and the planet's class are the
 * ones the dice gave (§4) — the Guide interprets a roll, it does not replace
 * one.
 */
export function checkSettlementProposal(
  value: SettlementProposalOutput,
  rolled: readonly RolledForProposal[],
): string | undefined {
  const known = new Set(rolled.map((roll) => roll.key));
  const problems: string[] = [];
  const grounded: (readonly [string, readonly string[]])[] = [
    ['name', value.name.groundedIn],
    ['location', value.location.groundedIn],
    ['population', value.population.groundedIn],
    ['authority', value.authority.groundedIn],
    ...value.projects.map((project, i) => [`project ${i + 1}`, project.groundedIn] as const),
    ...(value.planet === null
      ? []
      : [
          ['planet class', value.planet.planetClass.groundedIn] as const,
          ['planet name', value.planet.name.groundedIn] as const,
        ]),
    ...(value.firstLooks ?? []).map((look, i) => [`first look ${i + 1}`, look.groundedIn] as const),
  ];
  for (const [field, cites] of grounded) {
    if (cites.length === 0)
      problems.push(`The ${field} cites no oracle roll; ground it in one of the rolls given.`);
    for (const cite of cites)
      if (!known.has(cite))
        problems.push(`The ${field} cites "${cite}", which is not one of the rolls given.`);
  }
  const rowOf = (key: string) => rolled.find((roll) => roll.key === key)?.rowText;
  const location = settlementLocationFromRow(rowOf('location') ?? '');
  if (location !== undefined && value.location.value !== location)
    problems.push(`The location was rolled as ${location}; propose exactly that.`);
  const planetClass = planetClassFromRow(rowOf('planet_class') ?? '');
  if (
    value.planet !== null &&
    planetClass !== undefined &&
    value.planet.planetClass.value !== planetClass
  )
    problems.push(`The planet's class was rolled as ${planetClass}; propose exactly that class.`);
  return problems.length === 0 ? undefined : problems.join(' ');
}

/**
 * The one roll a trouble proposal cites (8.0e). A sector trouble is the
 * launch sector-trouble recipe; a settlement trouble is the trouble slot of
 * the starting-settlement recipe, which beat 9 rolls with its first looks.
 */
export function troubleProposalRolls(kind: 'sector' | 'settlement'): readonly SectorProposalRoll[] {
  return kind === 'sector'
    ? SECTOR_TROUBLE_RECIPE.rolls.map(toRoll())
    : buildStartingSettlementRecipe(1)
        .rolls.filter((slot) => slot.slot === 'trouble')
        .map(toRoll());
}

const TROUBLE_RULES = `You are the Guide for a game of Ironsworn: Starforged, helping a player establish trouble in their starting sector before play begins.

You interpret one rolled trouble as one or two sentences of situation the crew will walk into; the player reviews it, edits what they like, and accepts. You propose; the player decides.

Grounding: build the trouble from the rolled result and cite its key. It must be able to coexist with the accepted setting truths: do not contradict them, and do not settle a truth the player has deliberately left open. A settlement trouble happens at that settlement; a sector trouble spans the sector.

Give a reason for the trouble and one overall reason. Do not invent named people or factions, and do not decide what any crew member thinks or feels.`;

export function buildTroubleProposalRequest(
  state: CampaignState,
  trouble:
    { readonly kind: 'sector' } | { readonly kind: 'settlement'; readonly settlement: string },
  rolls: readonly RolledForProposal[],
): AiRequest {
  return {
    purpose: 'trouble_proposal',
    system: [{ text: TROUBLE_RULES }],
    user: [
      `<campaign>\n${renderSetup(state)}\n</campaign>`,
      `<oracle_rolls>\n${rolls.map((r) => `- ${r.key} (${r.label}): ${r.rowText}`).join('\n')}\n</oracle_rolls>`,
      trouble.kind === 'sector'
        ? 'Propose the sector trouble.'
        : `Propose the trouble at ${trouble.settlement}, the starting settlement.`,
    ].join('\n\n'),
    effort: 'low',
  };
}

export function troubleProposalSchema(rollKeys: readonly string[]) {
  const reason = z.string().min(1).max(300);
  return z.object({
    text: z.object({
      value: z.string().min(1).max(400),
      reason,
      groundedIn: z.array(z.enum(rollKeys as [string, ...string[]])).min(1),
    }),
    reason,
  });
}

export type TroubleProposalOutput = z.infer<ReturnType<typeof troubleProposalSchema>>;

/** The sector name's two rolls as proposal keys (8.6, D-196). */
export function sectorNameRolls(): readonly SectorProposalRoll[] {
  return SECTOR_NAME_RECIPE.rolls.map(toRoll());
}

const SECTOR_NAME_RULES = `You are the Guide for a game of Ironsworn: Starforged, helping a player name their starting sector before play begins.

The server has rolled a prefix and a suffix. Read them together into the sector's name, adapting the wording only as much as the campaign needs, and cite both rolls. Give one short reason for the name and one overall reason. You propose; the player decides.`;

export function buildSectorNameRequest(
  state: CampaignState,
  rolls: readonly RolledForProposal[],
): AiRequest {
  return {
    purpose: 'sector_name_proposal',
    system: [{ text: SECTOR_NAME_RULES }],
    user: [
      `<campaign>\n${renderSetup(state)}\n</campaign>`,
      `<oracle_rolls>\n${rolls.map((r) => `- ${r.key} (${r.label}): ${r.rowText}`).join('\n')}\n</oracle_rolls>`,
      'Propose the sector name.',
    ].join('\n\n'),
    effort: 'low',
  };
}

export function sectorNameSchema(rollKeys: readonly string[]) {
  const reason = z.string().min(1).max(300);
  return z.object({
    name: z.object({
      value: z.string().min(1).max(80),
      reason,
      groundedIn: z.array(z.enum(rollKeys as [string, ...string[]])).min(1),
    }),
    reason,
  });
}

export type SectorNameOutput = z.infer<ReturnType<typeof sectorNameSchema>>;
