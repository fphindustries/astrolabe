import type { ChallengeRank, CharacterId } from '@astrolabe/rules';
import type { AcceptLaunchIncidentRequestBody, CampaignState } from '@astrolabe/shared';

/**
 * The inciting vow's choices, made on the review page (9.3, beat 12, D-200):
 * who swears it, who shares it, its rank, and the opening scene's title.
 *
 * They are saved as a revision of the accepted incident, sending the choices
 * alone; the server carries the incident's words forward (9.0g). Where the
 * scene opens is not a choice: it is the starting settlement (D-168).
 */

export interface VowChoices {
  readonly rollerId?: CharacterId;
  /** Always includes the roller: the vow is theirs, and shared with the rest. */
  readonly participants: readonly CharacterId[];
  readonly rank: ChallengeRank;
  readonly sceneTitle: string;
}

/** The accepted choices, or a start: no roller yet, the whole crew sharing, the incident's rank. */
export function initialVowChoices(state: CampaignState): VowChoices | undefined {
  const incident = state.launch.incident;
  if (incident === undefined) return undefined;
  return {
    ...(incident.rollerId === undefined ? {} : { rollerId: incident.rollerId }),
    participants: incident.participants ?? (Object.keys(state.characters) as CharacterId[]),
    rank: incident.rank,
    sceneTitle: incident.openingScene?.title ?? '',
  };
}

/** Choosing who swears it also makes them one of those who share it. */
export function setRoller(choices: VowChoices, rollerId: CharacterId): VowChoices {
  return {
    ...choices,
    rollerId,
    participants: choices.participants.includes(rollerId)
      ? choices.participants
      : [...choices.participants, rollerId],
  };
}

/** The roller cannot be unticked; anyone else can. */
export function setSharing(
  choices: VowChoices,
  characterId: CharacterId,
  shares: boolean,
): VowChoices {
  if (!shares && characterId === choices.rollerId) return choices;
  const others = choices.participants.filter((id) => id !== characterId);
  return { ...choices, participants: shares ? [...others, characterId] : others };
}

export function setVowRank(choices: VowChoices, rank: ChallengeRank): VowChoices {
  return { ...choices, rank };
}

export function setSceneTitle(choices: VowChoices, sceneTitle: string): VowChoices {
  return { ...choices, sceneTitle };
}

/** The revision's body, or `null` until every choice is made. */
export function toVowChoicesRequest(
  choices: VowChoices,
): Omit<AcceptLaunchIncidentRequestBody, 'commandId'> | null {
  const title = choices.sceneTitle.trim();
  if (choices.rollerId === undefined || choices.participants.length === 0 || title === '')
    return null;
  return {
    incident: {
      rank: choices.rank,
      rollerId: choices.rollerId,
      participants: [...choices.participants],
      openingScene: { title },
    },
  };
}

/** Whether the form says something the accepted incident does not yet. */
export function vowChoicesChanged(state: CampaignState, choices: VowChoices): boolean {
  const incident = state.launch.incident;
  if (incident === undefined) return false;
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((id) => b.includes(id));
  return (
    incident.rollerId !== choices.rollerId ||
    !same(incident.participants ?? [], choices.participants) ||
    incident.rank !== choices.rank ||
    (incident.openingScene?.title ?? '') !== choices.sceneTitle.trim()
  );
}

/** Where Session 1 opens: the starting settlement, by name (D-168). */
export function sceneLocationName(state: CampaignState): string | undefined {
  const id = state.launch.startingSettlementId;
  return id === undefined ? undefined : state.launch.locations[id]?.name;
}
