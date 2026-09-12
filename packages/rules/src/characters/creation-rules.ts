import type { AssetCategory, AssetCategoryId } from '../schema/assets.js';

/**
 * The asset rules of character creation (D-89), as data rather than as a
 * check buried in a form.
 *
 * Creation is **three slots, not a quota**: two base paths and one final
 * asset. The starship sits outside them entirely.
 *
 * Like `MoveAutomation`, this is hand-authored — Datasworn ships the assets
 * a character is made of, not the procedure for making one. Where the rule
 * *is* stated in imported text, the slot carries the exact clause and
 * `assetCreationTraceProblems` checks it against the real collection
 * description, the same way `isVerbatimClause` checks move effects.
 *
 * Where it is not, the slot carries a page citation instead. Rulebook
 * pp. 104–110 are outside the CC-BY subset Datasworn imports, so they are
 * **cited, never quoted** — which is also why the slot count cannot be
 * traced the way the category rules can.
 */

export interface CreationSlot {
  readonly id: 'path_1' | 'path_2' | 'final';
  readonly label: string;
  /** The categories this slot will accept. */
  readonly allows: readonly AssetCategoryId[];
  /** A verbatim clause from the category's imported description, where one states the rule. */
  readonly clause?: { readonly category: AssetCategoryId; readonly text: string };
  /** Where the rule comes from when no imported text states it. */
  readonly citation?: string;
}

export interface CreationGrant {
  readonly category: AssetCategoryId;
  readonly reason: string;
  readonly clause: { readonly category: AssetCategoryId; readonly text: string };
}

export interface CharacterCreationRules {
  readonly slots: readonly CreationSlot[];
  /** Categories granted outright, occupying no slot. */
  readonly grants: readonly CreationGrant[];
  /** Categories that may never be chosen at creation. */
  readonly forbidden: readonly {
    readonly category: AssetCategoryId;
    readonly clause: { readonly category: AssetCategoryId; readonly text: string };
  }[];
}

/** The clause D-89 traces the path slots to. */
const PATH_CLAUSE = {
  category: 'path',
  text: "you'll select at least two paths to get started",
} as const;

export const CHARACTER_CREATION: CharacterCreationRules = {
  slots: [
    {
      id: 'path_1',
      label: 'First path',
      allows: ['path'],
      clause: PATH_CLAUSE,
    },
    {
      id: 'path_2',
      label: 'Second path',
      allows: ['path'],
      clause: PATH_CLAUSE,
    },
    {
      id: 'final',
      label: 'Final asset',
      // A third path is allowed here, so a character ends with two or three.
      allows: ['module', 'support_vehicle', 'companion', 'path'],
      citation: 'Ironsworn: Starforged Rulebook, pp. 104–110',
    },
  ],
  grants: [
    {
      category: 'command_vehicle',
      reason: 'Every character begins the campaign with the crew’s starship.',
      clause: {
        category: 'command_vehicle',
        text: 'It is a default asset for your character, taken when you begin your campaign',
      },
    },
  ],
  forbidden: [
    {
      category: 'deed',
      clause: {
        category: 'deed',
        text: 'you cannot choose a deed when creating your character',
      },
    },
  ],
};

/**
 * Every clause in the spec that is not a verbatim substring of the category
 * description it claims to come from.
 *
 * This is the same guarantee section 1's traceability test gives move
 * automation: a hand-authored rule that drifts from the imported text it
 * cites fails the build rather than quietly misstating the game. An empty
 * list means every traced rule still says what the source says.
 */
export function assetCreationTraceProblems(
  categories: readonly AssetCategory[],
  rules: CharacterCreationRules = CHARACTER_CREATION,
): readonly string[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const problems: string[] = [];

  const check = (clause: { category: AssetCategoryId; text: string }, where: string) => {
    const category = byId.get(clause.category);
    if (category === undefined) {
      problems.push(`${where}: no imported category "${clause.category}"`);
      return;
    }
    if (!category.description.includes(clause.text)) {
      problems.push(`${where}: "${clause.text}" is not in the ${clause.category} description`);
    }
  };

  for (const slot of rules.slots) {
    if (slot.clause !== undefined) {
      check(slot.clause, `slot ${slot.id}`);
    } else if (slot.citation === undefined) {
      problems.push(`slot ${slot.id}: neither a clause nor a citation`);
    }
  }
  for (const grant of rules.grants) {
    check(grant.clause, `grant ${grant.category}`);
  }
  for (const entry of rules.forbidden) {
    check(entry.clause, `forbidden ${entry.category}`);
  }

  return problems;
}
