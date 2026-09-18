import type { AssetId } from '../schema/ids.js';
import type { CharacterDraft, CharacterProblem, RulesetForCreation } from './creation.js';
import { validateCharacterDraft } from './creation.js';
import { CAMPAIGN_LAUNCH_CHARACTER_CREATION } from './launch-creation-rules.js';

export const CHALLENGE_RANKS = [
  'troublesome',
  'dangerous',
  'formidable',
  'extreme',
  'epic',
] as const;
export type ChallengeRank = (typeof CHALLENGE_RANKS)[number];

export type Backstory =
  { readonly kind: 'written'; readonly text: string } | { readonly kind: 'discover_in_play' };
export interface LaunchCharacterDraft extends CharacterDraft {
  readonly pronouns?: string;
  readonly appearance: string;
  readonly backstory: Backstory;
  readonly backgroundVow: { readonly title: string; readonly rank: ChallengeRank };
  readonly signatureGear?: string;
  readonly hooks?: readonly string[];
}

export type LaunchCharacterProblem =
  | CharacterProblem
  | {
      readonly code:
        | 'appearance_required'
        | 'backstory_required'
        | 'background_vow_required'
        | 'background_vow_rank_invalid';
      readonly field: 'appearance' | 'backstory' | 'backgroundVow';
      readonly message: string;
    };

export function validateLaunchCharacterDraft(
  draft: LaunchCharacterDraft,
  ruleset: RulesetForCreation,
): readonly LaunchCharacterProblem[] {
  const problems: LaunchCharacterProblem[] = [
    ...validateCharacterDraft(draft, ruleset, CAMPAIGN_LAUNCH_CHARACTER_CREATION),
  ];
  if (draft.appearance.trim() === '')
    problems.push({
      code: 'appearance_required',
      field: 'appearance',
      message: 'A launch character needs an appearance.',
    });
  if (draft.backstory.kind === 'written' && draft.backstory.text.trim() === '')
    problems.push({
      code: 'backstory_required',
      field: 'backstory',
      message: 'Write a backstory or explicitly discover it in play.',
    });
  if (draft.backgroundVow.title.trim() === '')
    problems.push({
      code: 'background_vow_required',
      field: 'backgroundVow',
      message: 'A launch character needs a background vow.',
    });
  if (!CHALLENGE_RANKS.includes(draft.backgroundVow.rank))
    problems.push({
      code: 'background_vow_rank_invalid',
      field: 'backgroundVow',
      message: 'Choose a legal challenge rank for the background vow.',
    });
  return problems;
}

export function isLaunchCharacterDraft(
  draft: LaunchCharacterDraft,
  ruleset: RulesetForCreation,
): boolean {
  return validateLaunchCharacterDraft(draft, ruleset).length === 0;
}

export interface InstalledModule {
  readonly assetId: AssetId;
  readonly ownerCharacterId: string;
}

/**
 * The modules installed on the shared ship, derived from the crew (D-191).
 *
 * A module is installed because a crew member's starting-asset slot holds
 * it, and that character is its owner (D-190). Every module in the imported
 * data is `shared`, which says the whole crew may use it, not that it has no
 * owner. Nothing is stored on the ship, so revising or removing a character
 * changes the ship with no second write.
 *
 * `crew` is in creation order. When two members hold the same module, the
 * earlier one's is installed; the later one is a Crew blocker
 * (`duplicateModuleHolders`), because one ship cannot install a module twice.
 */
export function installedModules(
  crew: readonly { readonly id: string; readonly assets: readonly AssetId[] }[],
  ruleset: RulesetForCreation,
): readonly InstalledModule[] {
  const installed = new Map<AssetId, InstalledModule>();
  for (const member of crew)
    for (const assetId of member.assets)
      if (isModule(assetId, ruleset) && !installed.has(assetId))
        installed.set(assetId, { assetId, ownerCharacterId: member.id });
  return [...installed.values()];
}

/**
 * Crew members holding a module an earlier member already installed (D-191).
 * Reported under Crew, on the later member, where the choice was made.
 */
export function duplicateModuleHolders(
  crew: readonly { readonly id: string; readonly assets: readonly AssetId[] }[],
  ruleset: RulesetForCreation,
): readonly {
  readonly characterId: string;
  readonly assetId: AssetId;
  readonly installedBy: string;
}[] {
  const installed = installedModules(crew, ruleset);
  return crew.flatMap((member) =>
    member.assets.flatMap((assetId) => {
      const owner = installed.find((module) => module.assetId === assetId)?.ownerCharacterId;
      return owner !== undefined && owner !== member.id
        ? [{ characterId: member.id, assetId, installedBy: owner }]
        : [];
    }),
  );
}

function isModule(assetId: AssetId, ruleset: RulesetForCreation): boolean {
  return ruleset.assets.find((asset) => asset.id === assetId)?.categoryId === 'module';
}

export interface SharedStarshipDraft {
  readonly name: string;
  readonly appearance: string;
  readonly history: string;
  readonly quirks: readonly string[];
  readonly integrity: StarshipIntegrity;
  readonly assetId: AssetId;
}

export interface StarshipIntegrity {
  readonly value: number;
  readonly min: number;
  readonly max: number;
}
/**
 * What every starting shared starship is before anyone describes it: the
 * imported Starship asset and its starting integrity (D-164).
 *
 * The server stamps these onto an accepted ship rather than taking them from
 * the client, so a request cannot pick a different asset or bounds (7.0a).
 */
export interface SharedStarshipBaseline {
  readonly assetId: AssetId;
  readonly integrity: StarshipIntegrity;
}

/**
 * Read from the imported asset (7.0b): the Starship's `integrity` condition
 * meter, which Datasworn declares as 0–5 starting at 5. Nothing here writes
 * the number itself, so the validator and the stamped ship cite one rule.
 */
export function sharedStarshipBaseline(ruleset: RulesetForCreation): SharedStarshipBaseline {
  const starship = ruleset.assets.find(
    (asset) => asset.categoryId === 'command_vehicle' && asset.name === 'Starship',
  );
  if (starship === undefined)
    throw new Error('The rules data has no Starship command-vehicle asset.');
  const meter = starship.conditionMeters?.find((candidate) => candidate.key === 'integrity');
  if (meter === undefined) throw new Error('The imported Starship has no integrity meter.');
  return {
    assetId: starship.id,
    integrity: { value: meter.value, min: meter.min, max: meter.max },
  };
}

export type SharedStarshipProblem = {
  readonly code: string;
  readonly field: string;
  readonly message: string;
};

export function validateSharedStarship(
  draft: SharedStarshipDraft,
  ruleset: RulesetForCreation,
): readonly SharedStarshipProblem[] {
  const problems: SharedStarshipProblem[] = [];
  if (draft.name.trim() === '')
    problems.push({
      code: 'name_required',
      field: 'name',
      message: 'The shared starship needs a name.',
    });
  if (draft.appearance.trim() === '')
    problems.push({
      code: 'appearance_required',
      field: 'appearance',
      message: 'The shared starship needs an appearance.',
    });
  if (draft.history.trim() === '')
    problems.push({
      code: 'history_required',
      field: 'history',
      message: 'The shared starship needs a history.',
    });
  if (
    draft.quirks.length < 1 ||
    draft.quirks.length > 2 ||
    draft.quirks.some((q) => q.trim() === '') ||
    new Set(draft.quirks).size !== draft.quirks.length
  )
    problems.push({
      code: 'quirks_invalid',
      field: 'quirks',
      message: 'Choose one or two distinct starship quirks.',
    });
  const baseline = sharedStarshipBaseline(ruleset);
  if (
    draft.integrity.value !== baseline.integrity.value ||
    draft.integrity.min !== baseline.integrity.min ||
    draft.integrity.max !== baseline.integrity.max
  )
    problems.push({
      code: 'integrity_invalid',
      field: 'integrity',
      message: `A starting starship has integrity ${baseline.integrity.value} of ${baseline.integrity.max}.`,
    });
  const starship = ruleset.assets.find((asset) => asset.id === draft.assetId);
  if (starship?.categoryId !== 'command_vehicle' || starship.name !== 'Starship')
    problems.push({
      code: 'starship_asset_invalid',
      field: 'assetId',
      message: 'Use the imported Starship command-vehicle asset.',
    });
  return problems;
}
