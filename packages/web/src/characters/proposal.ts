import type { AssetId, CreationSlot, RulesetForCreation, StatId } from '@astrolabe/rules';
import type { ChallengeRank, PayloadFor, ProposalRoll } from '@astrolabe/shared';

/**
 * Concept-first creation (task 3.3, D-124): turning the Guide's proposal
 * into the manual form's fields, and remembering which fields still hold
 * the Guide's value. Pure, so the form screen stays a thin binding.
 */

export type CharacterProposal = PayloadFor<'character.proposed'>;

export type ProposedField = 'name' | 'pronouns' | 'callsign' | 'stats' | 'assets' | 'vow' | 'hooks';

export const PROPOSED_FIELDS: readonly ProposedField[] = [
  'name',
  'pronouns',
  'callsign',
  'stats',
  'assets',
  'vow',
  'hooks',
];

/**
 * The fields this proposal fills. Pronouns only when the concept stated
 * them (D-131): otherwise the field stays the player's, untouched and
 * unmarked.
 */
export function proposedFields(proposal: CharacterProposal): readonly ProposedField[] {
  return PROPOSED_FIELDS.filter((field) => field !== 'pronouns' || proposal.pronouns !== undefined);
}

export const MAX_HOOKS = 3;

/** Everything the creation form holds. */
export interface CreationForm {
  readonly name: string;
  /** D-131: free text; blank means not recorded. */
  readonly pronouns: string;
  readonly callsign: string;
  readonly stats: Readonly<Record<StatId, number>>;
  readonly slotSelections: Readonly<Partial<Record<string, AssetId>>>;
  readonly swearVow: boolean;
  readonly vowTitle: string;
  readonly vowRank: ChallengeRank;
  readonly hooks: readonly string[];
}

/**
 * Place a proposal's assets into the creation slots, in slot order: each
 * slot takes the first unplaced asset its categories allow. The two path
 * slots accept only paths, so they fill first and the final slot takes
 * what is left. An asset that fits nowhere is left out, and
 * `validateCharacterDraft` reports the gap as it would for a hand-built
 * draft.
 */
export function slotsFromAssets(
  assets: readonly AssetId[],
  slots: readonly CreationSlot[],
  ruleset: Pick<RulesetForCreation, 'assets'>,
): Partial<Record<string, AssetId>> {
  const categoryOf = new Map(ruleset.assets.map((asset) => [asset.id, asset.categoryId]));
  const remaining = [...assets];
  const placed: Partial<Record<string, AssetId>> = {};
  for (const slot of slots) {
    const index = remaining.findIndex((id) => {
      const category = categoryOf.get(id);
      return category !== undefined && slot.allows.includes(category);
    });
    if (index >= 0) {
      placed[slot.id] = remaining[index];
      remaining.splice(index, 1);
    }
  }
  return placed;
}

/** The form with the named fields set from the proposal; every other field untouched. */
export function applyProposal(
  form: CreationForm,
  proposal: CharacterProposal,
  fields: readonly ProposedField[],
  slots: readonly CreationSlot[],
  ruleset: Pick<RulesetForCreation, 'assets'>,
): CreationForm {
  let next = form;
  for (const field of fields) {
    switch (field) {
      case 'name':
        next = { ...next, name: proposal.name.value };
        break;
      case 'pronouns':
        if (proposal.pronouns !== undefined) {
          next = { ...next, pronouns: proposal.pronouns.value };
        }
        break;
      case 'callsign':
        next = { ...next, callsign: proposal.callsign.value };
        break;
      case 'stats':
        next = { ...next, stats: { ...proposal.stats.value } };
        break;
      case 'assets':
        next = {
          ...next,
          slotSelections: slotsFromAssets(
            proposal.assets.map((a) => a.assetId),
            slots,
            ruleset,
          ),
        };
        break;
      case 'vow':
        next = {
          ...next,
          swearVow: true,
          vowTitle: proposal.backgroundVow.title,
          vowRank: proposal.backgroundVow.rank,
        };
        break;
      case 'hooks':
        next = { ...next, hooks: proposal.hooks.map((hook) => hook.text) };
        break;
    }
  }
  return next;
}

/** What the "Guide" marker under a field says: its reasons, and the rolls behind it. */
export interface GuideNote {
  readonly lines: readonly string[];
  readonly rolls: readonly ProposalRoll[];
}

export function guideNotes(
  proposal: CharacterProposal,
  rolls: readonly ProposalRoll[],
  ruleset: Pick<RulesetForCreation, 'assets'>,
): Readonly<Record<ProposedField, GuideNote>> {
  const cited = (ids: readonly string[]) => rolls.filter((roll) => ids.includes(roll.eventId));
  const nameOf = (id: AssetId) => ruleset.assets.find((asset) => asset.id === id)?.name ?? id;
  return {
    name: { lines: [proposal.name.reason], rolls: cited(proposal.name.groundedIn) },
    pronouns: {
      lines: proposal.pronouns === undefined ? [] : [proposal.pronouns.reason],
      rolls: [],
    },
    callsign: { lines: [proposal.callsign.reason], rolls: cited(proposal.callsign.groundedIn) },
    stats: { lines: [proposal.stats.reason], rolls: [] },
    assets: {
      lines: proposal.assets.map((asset) => `${nameOf(asset.assetId)}: ${asset.reason}`),
      rolls: [],
    },
    vow: { lines: [proposal.backgroundVow.reason], rolls: [] },
    hooks: {
      lines: proposal.hooks.map((hook) => hook.reason),
      rolls: cited(proposal.hooks.flatMap((hook) => hook.groundedIn)),
    },
  };
}

/** A roll as a chip reads: "Callsign 34: Wraith". */
export function rollChip(roll: ProposalRoll): string {
  return `${roll.label} ${roll.roll}: ${roll.rowText}`;
}

/** The hooks worth sending: trimmed, blanks dropped. */
export function hooksToSend(hooks: readonly string[]): readonly string[] {
  return hooks.map((hook) => hook.trim()).filter((hook) => hook.length > 0);
}
