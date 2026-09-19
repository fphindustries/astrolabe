import { STARFORGED, type ChallengeRank } from '@astrolabe/rules';
import type {
  AcceptLaunchIncidentRequestBody,
  CampaignState,
  EventId,
  LaunchDraftFor,
  PayloadFor,
} from '@astrolabe/shared';

/**
 * The inciting incident's form (9.2, beat 11, D-200): the Incident half of
 * Incident and Launch. Every transition is here, not in the `.tsx`.
 *
 * Beat 11 accepts the incident's words and rank, and the facts it drew on.
 * Who swears the vow, who shares it and the opening scene are the review
 * page's (beat 12), so they are not form state here. The player chooses one
 * of the Guide's options and may edit it, asks again, or writes their own.
 */

export type IncidentOption = PayloadFor<'incident.proposed'>['options'][number];

export interface IncidentForm {
  readonly text: string;
  readonly rank: ChallengeRank;
  /**
   * The Guide's option these words started from, while they still do. The
   * server resolves what it drew on and decides whether it was edited (9.0f).
   */
  readonly source?: { readonly eventId: EventId; readonly optionIndex: number };
}

const DEFAULT_RANK: ChallengeRank = 'formidable';

export const EMPTY_INCIDENT_FORM: IncidentForm = { text: '', rank: DEFAULT_RANK };

/** The saved draft or the accepted incident, whichever was written last (D-182). */
export function initialIncidentForm(state: CampaignState): IncidentForm {
  const accepted = state.launch.incident;
  const saved = state.launch.drafts.incident_launch;
  const draft = saved?.snapshot.incident;
  if (
    saved !== undefined &&
    draft !== undefined &&
    (accepted === undefined || saved.seq > accepted.seq)
  )
    return { text: draft.text ?? '', rank: draft.rank ?? DEFAULT_RANK };
  if (accepted === undefined) return EMPTY_INCIDENT_FORM;
  return { text: accepted.text, rank: accepted.rank };
}

/** The Guide's latest options, held in the fold so they survive a reload (9.0e). Not canon. */
export function heldIncidentOptions(state: CampaignState):
  | {
      readonly eventId: EventId;
      readonly options: readonly IncidentOption[];
    }
  | undefined {
  const held = state.launch.incidentProposal;
  return held === undefined ? undefined : { eventId: held.eventId, options: held.options };
}

/** Choose an option: its words and rank fill the form, and it is named as their source. */
export function chooseOption(
  eventId: EventId,
  optionIndex: number,
  option: IncidentOption,
): IncidentForm {
  return { text: option.title, rank: option.rank, source: { eventId, optionIndex } };
}

/** Editing keeps the source: an edited option is still the Guide's, edited (A41). */
export function setIncidentText(form: IncidentForm, text: string): IncidentForm {
  return { ...form, text };
}

export function setIncidentRank(form: IncidentForm, rank: ChallengeRank): IncidentForm {
  return { ...form, rank };
}

/** Write your own: the words stay to start from, the link to the option goes. */
export function writeOwn(form: IncidentForm): IncidentForm {
  return { text: form.text, rank: form.rank };
}

/**
 * The accepting body, or `null` without words. Only the words and rank, and
 * the option they came from (D-200). A revision without an option carries
 * the earlier acceptance and the vow's choices forward on the server.
 *
 * An option is named only while its proposal is still the one held. Asking
 * again replaces the options (9.0e), and the words left in the form are then
 * the player's own; naming the old proposal would be refused.
 */
export function toIncidentRequest(
  form: IncidentForm,
  heldEventId: EventId | undefined,
): Omit<AcceptLaunchIncidentRequestBody, 'commandId'> | null {
  if (form.text.trim() === '') return null;
  const source = form.source?.eventId === heldEventId ? form.source : undefined;
  return {
    incident: { text: form.text.trim(), rank: form.rank },
    ...(source === undefined ? {} : { proposal: source }),
  };
}

/** The body of **Save and continue**: durable, and deliberately not canon. */
export function toIncidentDraft(form: IncidentForm): LaunchDraftFor<'incident_launch'> {
  return { incident: { text: form.text, rank: form.rank } };
}

/**
 * What an option drew on, by name (A37): truths by their question, locations
 * and crew by name, and the other launch facts by what they are.
 */
export function drawsOnNames(state: CampaignState, option: IncidentOption): readonly string[] {
  const launch = state.launch;
  const fact = (id: string): string | undefined => {
    if (launch.starship?.starshipId === id) return `the ${launch.starship.name}`;
    if (launch.connection?.connectionId === id) return launch.connection.npcName;
    const trouble = Object.values(launch.troubles).find((t) => t.troubleId === id);
    if (trouble === undefined) return undefined;
    return trouble.kind === 'sector'
      ? 'the sector’s trouble'
      : `${launch.locations[trouble.ownerId]?.name ?? 'a settlement'}’s trouble`;
  };
  return [
    ...option.drawsOn.truths.map(
      (id) => STARFORGED.truths.find((truth) => truth.id === id)?.name ?? id,
    ),
    ...option.drawsOn.locations.map(
      (id) => launch.locations[id]?.name ?? state.entities[id]?.name ?? 'a location',
    ),
    ...option.drawsOn.characters.map((id) => state.characters[id]?.name ?? 'a crew member'),
    ...(option.drawsOn.launchFacts ?? []).flatMap((id) => fact(id) ?? []),
  ];
}
