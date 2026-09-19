import type { Asset, AssetCategory } from '../schema/assets.js';

import { CHARACTER_CREATION, type CharacterCreationRules } from './creation-rules.js';
import type { GameRules } from '../schema/game-rules.js';
import type { AssetId, MeterId, StatId } from '../schema/ids.js';

/**
 * What a character looks like at creation, and what makes one valid.
 *
 * Pure, and in `rules` rather than on the server, because both sides need
 * it: the client validates a field as it is edited (task 3.2), and the
 * server validates again before writing the event (task 3.5). One
 * implementation, so the two cannot disagree about what the rules say.
 *
 * Datasworn ships no creation rules — it has the *data* a character is made
 * of, but not the array they are assigned from or what a character starts
 * with. Those are constants of the game, hand-authored here the same way
 * move automation is, and each carries what it is grounded in.
 */

/** The five stats, in the order the character sheet lists them. */
export const STAT_IDS: readonly StatId[] = ['edge', 'heart', 'iron', 'shadow', 'wits'];

/**
 * Starforged assigns stats from a fixed array rather than rolling them:
 * one 3, two 2s, and two 1s, in any arrangement the player chooses.
 */
export const STARTING_STAT_ARRAY: readonly number[] = [3, 2, 2, 1, 1];

/** A new character begins with +2 momentum. */
export const STARTING_MOMENTUM = 2;

export interface MeterStart {
  readonly value: number;
  readonly min: number;
  readonly max: number;
}

/**
 * A new character's meters, read from the imported game rules rather than
 * hard-coded — Datasworn does carry `startingValue`, so this is one fewer
 * constant to keep in step with the book.
 *
 * The bounds travel with the value because the event log snapshots them
 * onto the character: the projector clamps against what it finds there, not
 * against the rules data it is forbidden to read.
 */
export function startingMeters(gameRules: GameRules): Record<MeterId, MeterStart> {
  const meters = {} as Record<MeterId, MeterStart>;
  for (const meter of gameRules.conditionMeters) {
    meters[meter.id] = { value: meter.startingValue, min: meter.min, max: meter.max };
  }
  return meters;
}

/** A character as the player has it so far — possibly not yet valid. */
export interface CharacterDraft {
  readonly name: string;
  readonly callsign: string;
  readonly stats: Readonly<Record<StatId, number>>;
  readonly assets: readonly AssetId[];
}

export type CharacterProblemCode =
  | 'name_required'
  | 'callsign_required'
  | 'stat_array_mismatch'
  | 'unknown_asset'
  | 'duplicate_asset'
  | 'too_many_assets'
  | 'too_few_paths'
  | 'forbidden_category'
  | 'category_not_allowed';

export interface CharacterProblem {
  readonly code: CharacterProblemCode;
  /** The draft field it belongs to, so a form can show it in place. */
  readonly field: 'name' | 'callsign' | 'stats' | 'assets';
  readonly message: string;
}

export interface RulesetForCreation {
  readonly assets: readonly Asset[];
  readonly assetCategories: readonly AssetCategory[];
  readonly gameRules: GameRules;
}

/**
 * Every problem with a draft, rather than the first.
 *
 * A creation form shows all of its errors at once — stopping at the first
 * would make a player fix five things in five round trips. The list is
 * empty exactly when the draft can be written.
 */
export function validateCharacterDraft(
  draft: CharacterDraft,
  ruleset: RulesetForCreation,
  rules: CharacterCreationRules = CHARACTER_CREATION,
): readonly CharacterProblem[] {
  const problems: CharacterProblem[] = [];

  if (draft.name.trim() === '') {
    problems.push({ code: 'name_required', field: 'name', message: 'A character needs a name.' });
  }
  if (draft.callsign.trim() === '') {
    problems.push({
      code: 'callsign_required',
      field: 'callsign',
      message: 'A character needs a callsign.',
    });
  }

  if (!matchesStatArray(draft.stats)) {
    problems.push({
      code: 'stat_array_mismatch',
      field: 'stats',
      message: `Stats are assigned from ${STARTING_STAT_ARRAY.join(', ')} — one of each value, in any order.`,
    });
  }

  problems.push(...validateAssets(draft.assets, ruleset, rules));
  return problems;
}

/**
 * The asset slots (D-89).
 *
 * Checked as a multiset against the slot spec rather than positionally: a
 * player fills the slots in whatever order they like, and the rule is about
 * what they end up holding.
 */
function validateAssets(
  chosen: readonly AssetId[],
  ruleset: RulesetForCreation,
  rules: CharacterCreationRules,
): readonly CharacterProblem[] {
  const problems: CharacterProblem[] = [];
  const byId = new Map(ruleset.assets.map((asset) => [asset.id, asset]));
  const seen = new Set<AssetId>();
  const resolved: Asset[] = [];

  for (const assetId of chosen) {
    const asset = byId.get(assetId);
    if (asset === undefined) {
      problems.push({
        code: 'unknown_asset',
        field: 'assets',
        message: `No asset "${assetId}" in the ruleset.`,
      });
      continue;
    }
    if (seen.has(assetId)) {
      problems.push({
        code: 'duplicate_asset',
        field: 'assets',
        message: `"${assetId}" is selected twice.`,
      });
    }
    seen.add(assetId);
    resolved.push(asset);
  }

  const forbidden = new Map(rules.forbidden.map((entry) => [entry.category, entry]));
  // Every chosen asset occupies a slot. The starship used to be granted and
  // filtered out here (D-89); it is the crew's since 7.3 (D-164, D-193).
  const occupying = resolved;

  for (const asset of occupying) {
    if (forbidden.has(asset.categoryId)) {
      problems.push({
        code: 'forbidden_category',
        field: 'assets',
        message: `${asset.name} is a ${asset.category} asset, which cannot be chosen at creation.`,
      });
    } else if (!rules.slots.some((slot) => slot.allows.includes(asset.categoryId))) {
      problems.push({
        code: 'category_not_allowed',
        field: 'assets',
        message: `${asset.name} is a ${asset.category} asset, which no creation slot accepts.`,
      });
    }
  }

  // Only a complete set is judged against the slot counts: a half-filled
  // draft is in progress, not wrong.
  if (occupying.length > rules.slots.length) {
    problems.push({
      code: 'too_many_assets',
      field: 'assets',
      message: `A character starts with ${rules.slots.length} assets; ${occupying.length} are selected.`,
    });
  } else if (occupying.length === rules.slots.length) {
    const pathSlots = rules.slots.filter(
      (slot) => slot.allows.length === 1 && slot.allows[0] === 'path',
    ).length;
    const paths = occupying.filter((asset) => asset.categoryId === 'path').length;
    if (paths < pathSlots) {
      problems.push({
        code: 'too_few_paths',
        field: 'assets',
        message: `A character starts with ${pathSlots} paths; ${paths} are selected.`,
      });
    }
  }

  return problems;
}

/**
 * The assigned values must be the starting array, in any arrangement — a
 * multiset comparison, not a positional one, because which stat gets the 3
 * is the player's choice.
 */
export function matchesStatArray(stats: Readonly<Record<StatId, number>>): boolean {
  const assigned = STAT_IDS.map((stat) => stats[stat]).sort((a, b) => a - b);
  const expected = [...STARTING_STAT_ARRAY].sort((a, b) => a - b);
  return assigned.length === expected.length && assigned.every((v, i) => v === expected[i]);
}

/** Whether a draft is ready to be written as a character. */
export function isValidCharacterDraft(
  draft: CharacterDraft,
  ruleset: RulesetForCreation,
  rules: CharacterCreationRules = CHARACTER_CREATION,
): boolean {
  return validateCharacterDraft(draft, ruleset, rules).length === 0;
}
