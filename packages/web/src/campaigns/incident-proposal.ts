import type { OracleTable } from '@astrolabe/rules';
import type { CampaignState, ChallengeRank, PayloadFor, ProposalRoll } from '@astrolabe/shared';

/**
 * AI-proposed inciting incidents (task 4.6, D-132): what an option card
 * shows, and whether the vow form still holds the Guide's words. Pure, so
 * the step stays a thin binding.
 */

export type IncidentOption = PayloadFor<'incident.proposed'>['options'][number];

/** What the vow form holds. */
export interface VowForm {
  readonly title: string;
  readonly rank: ChallengeRank;
}

/** The rolls an option cites, in roll order. */
export function optionRolls(
  option: IncidentOption,
  rolls: readonly ProposalRoll[],
): readonly ProposalRoll[] {
  return rolls.filter((roll) => option.groundedIn.includes(roll.eventId));
}

/**
 * What an option draws on, by the names the player knows: a truth by its
 * question, a location by its name, a crew member by callsign. Something
 * no longer in the campaign is left out rather than shown as an id.
 */
export function drawsOnLabels(
  option: IncidentOption,
  state: Pick<CampaignState, 'entities' | 'characters'>,
  truths: readonly Pick<OracleTable, 'id' | 'name'>[],
): readonly string[] {
  return [
    ...option.drawsOn.truths.map((id) => truths.find((truth) => truth.id === id)?.name),
    ...option.drawsOn.locations.map((id) => state.entities[id]?.name),
    ...option.drawsOn.characters.map((id) => state.characters[id]?.callsign),
  ].filter((label): label is string => label !== undefined);
}

/** The form holding exactly the option's words: its title, trimmed, and its rank. */
export function holdsOption(form: VowForm, option: IncidentOption): boolean {
  return form.title.trim() === option.title && form.rank === option.rank;
}

/**
 * Whether using an option would replace words the player wrote: the title
 * has text, and it isn't simply an option the player already used.
 */
export function wouldReplaceWriting(form: VowForm, used: IncidentOption | undefined): boolean {
  return form.title.trim() !== '' && (used === undefined || !holdsOption(form, used));
}
