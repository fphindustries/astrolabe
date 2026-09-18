import {
  CHARACTER_CREATION,
  STARTING_STAT_ARRAY,
  STAT_IDS,
  type Asset,
  type AssetCategory,
  type CharacterDraft,
  type CharacterProblem,
  type CreationSlot,
  type RulesetForCreation,
  type StatId,
} from '@astrolabe/rules';

/**
 * Pure view-models and helpers for the manual creation form (task 3.2) and
 * the asset picker (3.4), kept out of JSX per the app's component
 * convention (`play/crew/crew.ts`) and unit tested without a DOM.
 */

/**
 * A fresh draft's stats are already a valid arrangement of the starting
 * array (`STARTING_STAT_ARRAY` zipped onto `STAT_IDS` in order) — the
 * player rearranges from here via `assignStat`, which preserves validity,
 * so `matchesStatArray` never fails through this UI.
 */
export function emptyDraft(): CharacterDraft {
  return {
    name: '',
    callsign: '',
    stats: initialStats(),
    assets: [],
  };
}

function initialStats(): Record<StatId, number> {
  const stats = {} as Record<StatId, number>;
  STAT_IDS.forEach((id, index) => {
    stats[id] = STARTING_STAT_ARRAY[index] ?? 0;
  });
  return stats;
}

/**
 * Assigns `value` to `statId`, swapping it with whichever stat currently
 * holds it. A swap rather than an overwrite is what keeps every
 * intermediate state a valid permutation of the starting array — there is
 * no state this can reach where two stats hold the same value, so the form
 * never needs to show a "stats don't match the array" error.
 */
export function assignStat(
  stats: Readonly<Record<StatId, number>>,
  statId: StatId,
  value: number,
): Record<StatId, number> {
  const previousValue = stats[statId];
  const swapWith = STAT_IDS.find((id) => id !== statId && stats[id] === value);
  const updated: Record<StatId, number> = { ...stats, [statId]: value };
  if (swapWith !== undefined) {
    updated[swapWith] = previousValue;
  }
  return updated;
}

/** Every problem's message, grouped by the field it belongs to (D-90). */
export function problemsByField(
  problems: readonly CharacterProblem[],
): Readonly<Record<CharacterProblem['field'], readonly string[]>> {
  const grouped: Record<CharacterProblem['field'], string[]> = {
    name: [],
    callsign: [],
    stats: [],
    assets: [],
  };
  for (const problem of problems) {
    grouped[problem.field].push(problem.message);
  }
  return grouped;
}

export interface SlotOptionGroup {
  readonly category: AssetCategory;
  readonly assets: readonly Asset[];
}

/**
 * The assets a slot's `<select>` should offer, grouped by category for
 * `<optgroup>` headings — one group per category the slot `allows`, in the
 * order `CHARACTER_CREATION` declares them. **Never recount or re-derive
 * slot legality here** beyond category membership; `validateCharacterDraft`
 * is what actually decides whether a draft is valid (section 3's note).
 */
export function slotOptionGroups(
  slot: CreationSlot,
  ruleset: Pick<RulesetForCreation, 'assets' | 'assetCategories'>,
): readonly SlotOptionGroup[] {
  const categoryById = new Map(ruleset.assetCategories.map((category) => [category.id, category]));
  const groups: SlotOptionGroup[] = [];
  for (const categoryId of slot.allows) {
    const category = categoryById.get(categoryId);
    if (category === undefined) {
      continue;
    }
    groups.push({
      category,
      assets: ruleset.assets.filter((asset) => asset.categoryId === categoryId),
    });
  }
  return groups;
}

/** The slots in `CHARACTER_CREATION`, exposed for the picker to iterate — no other file should reach into the rules constant directly. */
export const CREATION_SLOTS: readonly CreationSlot[] = CHARACTER_CREATION.slots;
