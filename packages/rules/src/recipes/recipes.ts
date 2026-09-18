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

/**
 * The recipes Chapter 2 rolls and task 1.3 did not declare (8.0c).
 *
 * Every table here is in the frozen data, and until now it was reachable only
 * through the single-oracle roll, so a whole-object Roll or a Guide proposal
 * had no declared recipe to ground itself in (D-65, D-166).
 *
 * Which command rolls what (3R.5c): a whole-object **Roll** — every field of a
 * settlement, both halves of a name — rolls the recipe through
 * `rollLaunchRecipe`. A one-field **Roll** rolls that field's own oracle, named
 * here, through `rollLaunchOracle`. A starting planet is shallow first and
 * deepened after, because the `starting_detail` recipe has no name slot.
 */

/** Beat 7's sector name: a prefix and a suffix, read together. */
export const SECTOR_NAME_RECIPE: OracleRecipe = {
  id: 'recipe:campaign-launch/sector-name',
  label: 'a sector name',
  entityKind: 'sector',
  rolls: [
    { slot: 'prefix', oracle: 'oracle:space/sector-name/prefix', name: true },
    { slot: 'suffix', oracle: 'oracle:space/sector-name/suffix', name: true },
  ],
};

/**
 * Beat 9's zoom into the starting settlement: one or two first looks and its
 * trouble. Concrete per count, as the settlement's projects are (D-173).
 */
export function buildStartingSettlementRecipe(firstLookCount: 1 | 2): OracleRecipe {
  return {
    id: `recipe:campaign-launch/starting-settlement/${firstLookCount}`,
    label: 'the starting settlement up close',
    entityKind: 'settlement',
    rolls: [
      ...Array.from({ length: firstLookCount }, (_, index) => ({
        slot: `first_look_${index + 1}`,
        oracle: 'oracle:settlements/first-look' as const,
      })),
      { slot: 'trouble', oracle: 'oracle:settlements/trouble' },
    ],
  };
}

/**
 * A planet's class, rolled before its class-specific recipe is materialized
 * (D-173). Read the result with `planetClassFromRow`.
 */
export const PLANET_CLASS_RECIPE: OracleRecipe = {
  id: 'recipe:campaign-launch/planet-class',
  label: "a planet's class",
  entityKind: 'planet',
  rolls: [{ slot: 'class', oracle: 'oracle:planets/class' }],
};

/** The sector's optional star (D-195). */
export const STAR_RECIPE: OracleRecipe = {
  id: 'recipe:campaign-launch/star',
  label: "the sector's star",
  entityKind: 'star',
  rolls: [{ slot: 'stellar_object', oracle: 'oracle:space/stellar-object' }],
};

const SETTLEMENT_LOCATIONS = {
  planetside: 'planetside',
  orbital: 'orbital',
  'deep space': 'deep_space',
} as const;

/**
 * The settlement location a rolled row names, or `undefined` for a row that
 * is not one (8.0c). The table's rows read "Planetside", "Orbital" and "Deep
 * Space"; the fact is the schema's enum.
 */
export function settlementLocationFromRow(
  rowText: string,
): 'planetside' | 'orbital' | 'deep_space' | undefined {
  const key = rowText.trim().toLowerCase();
  return key in SETTLEMENT_LOCATIONS
    ? SETTLEMENT_LOCATIONS[key as keyof typeof SETTLEMENT_LOCATIONS]
    : undefined;
}

/**
 * The planet class a rolled row names, or `undefined` (8.0c).
 *
 * The class table's rows are Datasworn link markup —
 * `[Desert World](id:oracle:planets/desert)` — so the class is read from the
 * linked table id, which is stable, rather than from the words, which are
 * display text. A row already stripped of its markup ("Desert World") is read
 * from its first word as a fallback.
 */
export function planetClassFromRow(rowText: string): PlanetClass | undefined {
  const linked = /\(id:oracle:planets\/([a-z]+)\)/.exec(rowText)?.[1];
  const candidate = linked ?? rowText.trim().split(/\s+/)[0]?.toLowerCase();
  return PLANET_CLASSES.find((planetClass) => planetClass === candidate);
}

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
  SECTOR_NAME_RECIPE,
  ...([1, 2] as const).map(buildStartingSettlementRecipe),
  PLANET_CLASS_RECIPE,
  STAR_RECIPE,
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
  'sector_name',
  'starting_settlement',
  'planet_class',
  'star',
] as const;

export type LaunchRecipeSelector =
  | { readonly kind: 'starship'; readonly quirkCount: 1 | 2 }
  | { readonly kind: 'settlement'; readonly region: LaunchRegion; readonly projectCount: 1 | 2 }
  | { readonly kind: 'planet'; readonly planetClass: PlanetClass; readonly depth: PlanetDepth }
  | { readonly kind: 'character' }
  | { readonly kind: 'starting_connection' }
  | { readonly kind: 'sector_trouble' }
  | { readonly kind: 'inciting_incident' }
  | { readonly kind: 'sector_name' }
  | { readonly kind: 'starting_settlement'; readonly firstLookCount: 1 | 2 }
  | { readonly kind: 'planet_class' }
  | { readonly kind: 'star' };

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
    case 'sector_name':
      return SECTOR_NAME_RECIPE;
    case 'starting_settlement':
      return buildStartingSettlementRecipe(selector.firstLookCount);
    case 'planet_class':
      return PLANET_CLASS_RECIPE;
    case 'star':
      return STAR_RECIPE;
  }
}
