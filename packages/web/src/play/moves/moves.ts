import {
  withoutLinks,
  type AdaptedRuleset,
  type Move,
  type MoveCategoryId,
  type MoveId,
} from '@astrolabe/rules';

/**
 * Pure view-model for the moves reference browser (task 5.7, D-104): the
 * "full list one click away" task 6.1 will later link to, built now with a
 * small entry point in the top bar rather than waiting for the relevant-moves
 * panel to exist.
 */

export interface MoveListItem {
  readonly id: MoveId;
  readonly name: string;
}

export interface MoveCategoryGroup {
  readonly category: MoveCategoryId;
  readonly label: string;
  readonly moves: readonly MoveListItem[];
}

export interface MoveOutcomeView {
  readonly tier: string;
  readonly text: string;
}

export interface MoveDetailView {
  readonly id: MoveId;
  readonly name: string;
  readonly triggerText: string;
  readonly outcomes: readonly MoveOutcomeView[];
  readonly embeddedOracleNames: readonly string[];
}

/** The 12 categories, in the order Starforged's own rulebook presents them. */
const CATEGORY_ORDER: readonly MoveCategoryId[] = [
  'session',
  'adventure',
  'quest',
  'connection',
  'exploration',
  'combat',
  'suffer',
  'recover',
  'threshold',
  'legacy',
  'fate',
  'scene_challenge',
];

function categoryLabel(category: MoveCategoryId): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function movesByCategory(moves: readonly Move[]): readonly MoveCategoryGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: categoryLabel(category),
    moves: moves
      .filter((move) => move.category === category)
      .map((move) => ({ id: move.id, name: move.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.moves.length > 0);
}

export function moveDetail(move: Move, oracles: AdaptedRuleset['oracles']): MoveDetailView {
  const oracleById = new Map(oracles.map((oracle) => [oracle.id, oracle]));
  return {
    id: move.id,
    name: move.name,
    triggerText: withoutLinks(move.trigger.text),
    outcomes:
      move.outcomes === null
        ? []
        : Object.entries(move.outcomes)
            .filter((pair): pair is [string, { text: string }] => pair[1] !== undefined)
            .map(([tier, outcome]) => ({ tier, text: withoutLinks(outcome.text) })),
    embeddedOracleNames: move.embeddedOracles.map((id) => oracleById.get(id)?.name ?? id),
  };
}
