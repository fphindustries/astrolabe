import type { Asset } from '../schema/assets.js';
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
  | 'duplicate_asset';

export interface CharacterProblem {
  readonly code: CharacterProblemCode;
  /** The draft field it belongs to, so a form can show it in place. */
  readonly field: 'name' | 'callsign' | 'stats' | 'assets';
  readonly message: string;
}

export interface RulesetForCreation {
  readonly assets: readonly Asset[];
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

  const known = new Set(ruleset.assets.map((asset) => asset.id));
  const seen = new Set<AssetId>();
  for (const assetId of draft.assets) {
    if (!known.has(assetId)) {
      problems.push({
        code: 'unknown_asset',
        field: 'assets',
        message: `No asset "${assetId}" in the ruleset.`,
      });
    } else if (seen.has(assetId)) {
      problems.push({
        code: 'duplicate_asset',
        field: 'assets',
        message: `"${assetId}" is selected twice.`,
      });
    }
    seen.add(assetId);
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
export function isValidCharacterDraft(draft: CharacterDraft, ruleset: RulesetForCreation): boolean {
  return validateCharacterDraft(draft, ruleset).length === 0;
}
