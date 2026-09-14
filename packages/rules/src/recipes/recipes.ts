import type { RecipeId } from '../schema/ids.js';
import type { OracleRecipe } from '../schema/oracles.js';

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

export const ORACLE_RECIPES: ReadonlyMap<RecipeId, OracleRecipe> = new Map(
  [NPC_RECIPE, DERELICT_RECIPE].map((recipe) => [recipe.id, recipe]),
);
