import type { RecipeId } from '../schema/ids.js';
import type { OracleRecipe } from '../schema/oracles.js';
import type { LaunchRegion } from '../launch/rules.js';

/**
 * D-65's declared recipes, hand-authored because Datasworn ships none
 * (D-139). Milestone 1 declares only the two the golden session exercises;
 * a location or faction recipe waits for a beat that needs one (D-144).
 */

/** Beat 6: "role, goal, first look, disposition, and name". */
export const NPC_RECIPE: OracleRecipe = {
  id: 'recipe:npc',
  label: 'a non-player character',
  entityKind: 'npc',
  rolls: [
    { slot: 'role', oracle: 'oracle:characters/role' },
    { slot: 'goal', oracle: 'oracle:characters/goal' },
    { slot: 'first_look', oracle: 'oracle:characters/first-look' },
    { slot: 'disposition', oracle: 'oracle:characters/initial-disposition' },
    { slot: 'given_name', oracle: 'oracle:characters/name/given', name: true },
    { slot: 'family_name', oracle: 'oracle:characters/name/family-name', name: true },
  ],
};

/**
 * Beat 2. No location or type slot (D-139): the type table depends on the
 * location roll, and the scene frames a derelict that is already
 * established, whose location a roll could only contradict.
 */
export const DERELICT_RECIPE: OracleRecipe = {
  id: 'recipe:derelict',
  label: 'a derelict',
  entityKind: 'derelict',
  rolls: [
    { slot: 'condition', oracle: 'oracle:derelicts/condition' },
    { slot: 'outer_first_look', oracle: 'oracle:derelicts/outer-first-look' },
    { slot: 'inner_first_look', oracle: 'oracle:derelicts/inner-first-look' },
  ],
};

export function buildStarshipRecipe(quirkCount: 1 | 2): OracleRecipe {
  return {
    id: `recipe:campaign-launch/starship/${quirkCount}`,
    label: 'a shared starship',
    entityKind: 'starship',
    rolls: [
      { slot: 'name', oracle: 'oracle:starships/starship-name', name: true },
      { slot: 'history', oracle: 'oracle:campaign-launch/starship-history' },
      ...Array.from({ length: quirkCount }, (_, index) => ({
        slot: `quirk_${index + 1}`,
        oracle: 'oracle:campaign-launch/starship-quirks' as const,
      })),
    ],
  };
}
export function buildSettlementRecipe(region: LaunchRegion, projectCount: 1 | 2): OracleRecipe {
  return {
    id: `recipe:campaign-launch/settlement/${region}/${projectCount}`,
    label: 'a settlement',
    entityKind: 'settlement',
    rolls: [
      { slot: 'name', oracle: 'oracle:settlements/name', name: true },
      { slot: 'location', oracle: 'oracle:settlements/location' },
      { slot: 'population', oracle: `oracle:settlements/population/${region}` as const },
      { slot: 'authority', oracle: 'oracle:settlements/authority' },
      ...Array.from({ length: projectCount }, (_, index) => ({
        slot: `project_${index + 1}`,
        oracle: 'oracle:settlements/projects' as const,
      })),
    ],
  };
}
/** The eleven planet classes Chapter 2's tables cover. */
export const PLANET_CLASSES = [
  'desert',
  'furnace',
  'grave',
  'ice',
  'jovian',
  'jungle',
  'ocean',
  'rocky',
  'shattered',
  'tainted',
  'vital',
] as const;
export type PlanetClass = (typeof PLANET_CLASSES)[number];

export type PlanetDepth = 'shallow' | 'starting_detail';
export function buildPlanetRecipe(planetClass: string, depth: PlanetDepth): OracleRecipe {
  const base = `oracle:planets/${planetClass}` as const;
  return {
    id: `recipe:campaign-launch/planet/${planetClass}/${depth}`,
    label: depth === 'shallow' ? 'a shallow planet' : 'a detailed starting planet',
    entityKind: 'planet',
    rolls:
      depth === 'shallow'
        ? [{ slot: 'name', oracle: `${base}/name` as const, name: true }]
        : [
            { slot: 'atmosphere', oracle: `${base}/atmosphere` as const },
            { slot: 'observed_from_space', oracle: `${base}/observed-from-space` as const },
            { slot: 'feature', oracle: `${base}/feature` as const },
          ],
  };
}
/**
 * The rolls a Guide-proposed launch character is built from (D-186).
 *
 * Task 1.3's enumeration omitted a character, so these five lived as a list in
 * `ai/context/creation.ts`. Nothing about that was unsound — the list was
 * server-owned and a client could never name a table — but it sat outside
 * `rules` and outside the materialization completeness test, which is the one
 * thing D-166's "the server rolls a declared recipe" is supposed to guarantee.
 *
 * **The slot names are the proposal's roll keys**, which is why they are
 * kebab-case where every other recipe here is snake_case: the character
 * proposal schema enumerates these exact strings as the values a field may
 * cite, and `checkCharacterProposal` validates against them. Renaming them
 * would change the AI contract to buy consistency, which is the wrong trade.
 *
 * **Two backstory slots, one table.** A single slot rolled twice returns two
 * results under one name, which would collapse `backstory-1` and `backstory-2`
 * into one key and break both the citation enum and the grounding check. Two
 * slots over the same oracle is the correct declaration, not a duplicate.
 */
export const CHARACTER_RECIPE: OracleRecipe = {
  id: 'recipe:campaign-launch/character',
  label: 'a crew member',
  entityKind: 'character',
  rolls: [
    {
      slot: 'given-name',
      oracle: 'oracle:characters/name/given',
      name: true,
      label: 'Given name',
    },
    {
      slot: 'family-name',
      oracle: 'oracle:characters/name/family-name',
      name: true,
      label: 'Family name',
    },
    { slot: 'callsign', oracle: 'oracle:characters/name/callsign', label: 'Callsign' },
    {
      slot: 'backstory-1',
      oracle: 'oracle:campaign-launch/backstory-prompts',
      label: 'Backstory prompt',
    },
    {
      slot: 'backstory-2',
      oracle: 'oracle:campaign-launch/backstory-prompts',
      label: 'Backstory prompt',
    },
  ],
};

export const STARTING_CONNECTION_RECIPE: OracleRecipe = {
  id: 'recipe:campaign-launch/connection',
  label: 'a local connection',
  entityKind: 'connection',
  rolls: NPC_RECIPE.rolls,
};
export const SECTOR_TROUBLE_RECIPE: OracleRecipe = {
  id: 'recipe:campaign-launch/sector-trouble',
  label: 'sector trouble',
  entityKind: 'trouble',
  rolls: [{ slot: 'trouble', oracle: 'oracle:campaign-launch/sector-trouble' }],
};
export const INCITING_INCIDENT_RECIPE: OracleRecipe = {
  id: 'recipe:campaign-launch/inciting-incident',
  label: 'an inciting incident',
  entityKind: 'incident',
  rolls: [{ slot: 'incident', oracle: 'oracle:campaign-launch/inciting-incident' }],
};

/** Enumerates legal contextual recipes for completeness tests and tooling. */
export const CAMPAIGN_LAUNCH_RECIPE_MATERIALIZATIONS: readonly OracleRecipe[] = [
  ...([1, 2] as const).map(buildStarshipRecipe),
  ...(['terminus', 'outlands', 'expanse'] as const).flatMap((region) =>
    ([1, 2] as const).map((count) => buildSettlementRecipe(region, count)),
  ),
  ...PLANET_CLASSES.flatMap((planetClass) =>
    (['shallow', 'starting_detail'] as const).map((depth) => buildPlanetRecipe(planetClass, depth)),
  ),
  CHARACTER_RECIPE,
  STARTING_CONNECTION_RECIPE,
  SECTOR_TROUBLE_RECIPE,
  INCITING_INCIDENT_RECIPE,
];

export const ORACLE_RECIPES: ReadonlyMap<RecipeId, OracleRecipe> = new Map(
  [NPC_RECIPE, DERELICT_RECIPE].map((recipe) => [recipe.id, recipe]),
);

/**
 * What a caller asks for when it wants a launch recipe rolled.
 *
 * D-65 and D-166 put the server in charge of rolling a *declared* recipe
 * before the Guide interprets it, and D-173 keeps materialization concrete.
 * Naming the recipe by its parameters rather than by an oracle id is what
 * enforces both: a caller cannot name a table that is not in a recipe, and
 * cannot roll a materialization the rules do not declare.
 */
/**
 * Every kind of launch recipe a caller may ask for, as a value.
 *
 * The selector union below is the type; this is the same list the wire schema
 * has to agree with, and `recipes.test.ts` asserts that it does. Without it
 * the two are hand-maintained in parallel — which is how `character` was
 * declared in the rules and left unreachable over HTTP, the same
 * declared-but-unreadable shape this group keeps finding.
 */
export const LAUNCH_RECIPE_KINDS = [
  'starship',
  'settlement',
  'planet',
  'character',
  'starting_connection',
  'sector_trouble',
  'inciting_incident',
] as const;

export type LaunchRecipeSelector =
  | { readonly kind: 'starship'; readonly quirkCount: 1 | 2 }
  | { readonly kind: 'settlement'; readonly region: LaunchRegion; readonly projectCount: 1 | 2 }
  | { readonly kind: 'planet'; readonly planetClass: PlanetClass; readonly depth: PlanetDepth }
  | { readonly kind: 'character' }
  | { readonly kind: 'starting_connection' }
  | { readonly kind: 'sector_trouble' }
  | { readonly kind: 'inciting_incident' };

/** Resolve a selector to the concrete recipe it names. Total over the union. */
export function materializeLaunchRecipe(selector: LaunchRecipeSelector): OracleRecipe {
  switch (selector.kind) {
    case 'starship':
      return buildStarshipRecipe(selector.quirkCount);
    case 'settlement':
      return buildSettlementRecipe(selector.region, selector.projectCount);
    case 'planet':
      return buildPlanetRecipe(selector.planetClass, selector.depth);
    case 'character':
      return CHARACTER_RECIPE;
    case 'starting_connection':
      return STARTING_CONNECTION_RECIPE;
    case 'sector_trouble':
      return SECTOR_TROUBLE_RECIPE;
    case 'inciting_incident':
      return INCITING_INCIDENT_RECIPE;
  }
}
