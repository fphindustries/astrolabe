import {
  STARTING_CONNECTION_RECIPE,
  withoutLinks,
  type ChallengeRank,
  type CharacterId,
  type OracleId,
} from '@astrolabe/rules';
import { CONNECTION_PROPOSAL_TARGET } from '@astrolabe/shared';
import type {
  CampaignState,
  EstablishLaunchConnectionRequestBody,
  EventId,
  LaunchDraftFor,
  PayloadFor,
} from '@astrolabe/shared';

/**
 * The local connection's form (9.1, beat 10, D-167): the Connection half of
 * Connection and Troubles. Every transition is here, not in the `.tsx`.
 *
 * The connection is an automatic strong hit (D-167): the rules' result, with
 * no die rolled. What the player states is the person (name, role, goal,
 * first look, disposition), the connection's rank, and which crew members
 * share it. The ids of the connection, the NPC and the track are the server's.
 *
 * The section's one draft also holds the troubles, which group 8 built.
 * **Save and continue here keeps whatever troubles the draft already holds**,
 * as the troubles' own save keeps the connection.
 */

export type ConnectionField = 'npcName' | 'role' | 'goal' | 'firstLook' | 'disposition';

export const CONNECTION_FIELDS: readonly ConnectionField[] = [
  'npcName',
  'role',
  'goal',
  'firstLook',
  'disposition',
];

export const CONNECTION_FIELD_LABELS: Readonly<Record<ConnectionField, string>> = {
  npcName: 'Name',
  role: 'Role',
  goal: 'Goal',
  firstLook: 'First look',
  disposition: 'Disposition',
};

/**
 * The oracles behind each field, read from the declared NPC recipe, so a
 * field-level Roll can reach only a table the rules put there. A name is two
 * rolls, given and family.
 */
export const CONNECTION_FIELD_ORACLES: Readonly<Record<ConnectionField, readonly OracleId[]>> = {
  npcName: [recipeOracle('given_name'), recipeOracle('family_name')],
  role: [recipeOracle('role')],
  goal: [recipeOracle('goal')],
  firstLook: [recipeOracle('first_look')],
  disposition: [recipeOracle('disposition')],
};

function recipeOracle(slot: string): OracleId {
  const found = STARTING_CONNECTION_RECIPE.rolls.find((roll) => roll.slot === slot);
  if (found === undefined) throw new Error(`The NPC recipe declares no "${slot}" slot.`);
  return found.oracle;
}

export interface ConnectionForm {
  readonly npcName: string;
  readonly role: string;
  readonly goal: string;
  readonly firstLook: string;
  readonly disposition: string;
  readonly rank: ChallengeRank;
  /** Who shares the connection (D-168). */
  readonly participants: readonly CharacterId[];
  /** The field rolls the player made and kept, by field (A41). */
  readonly fieldRolls: Readonly<Partial<Record<ConnectionField, readonly EventId[]>>>;
  /** Citations carried from an accepted connection or a restored draft. */
  readonly carried: readonly EventId[];
  /** The Guide proposal these words came from; the server decides if they were edited. */
  readonly proposalEventId?: EventId;
}

const DEFAULT_RANK: ChallengeRank = 'dangerous';

/** A new connection is shared by the whole crew, until the player says otherwise. */
export function emptyConnectionForm(state: CampaignState): ConnectionForm {
  return {
    npcName: '',
    role: '',
    goal: '',
    firstLook: '',
    disposition: '',
    rank: DEFAULT_RANK,
    participants: Object.keys(state.characters) as CharacterId[],
    fieldRolls: {},
    carried: [],
  };
}

/**
 * The form as the player left it (D-182): the saved draft or the accepted
 * connection, whichever was written last. The accepted person's goal, first
 * look and disposition are the NPC's fields (9.0d), not the connection's.
 */
export function initialConnectionForm(state: CampaignState): ConnectionForm {
  const accepted = state.launch.connection;
  const saved = state.launch.drafts.connection_troubles;
  const draft = saved?.snapshot.connection;
  const empty = emptyConnectionForm(state);
  if (
    saved !== undefined &&
    draft !== undefined &&
    (accepted === undefined || saved.seq > accepted.seq)
  ) {
    return {
      npcName: draft.npcName ?? '',
      role: draft.role ?? '',
      goal: draft.details?.goal ?? '',
      firstLook: draft.details?.firstLook ?? '',
      disposition: draft.details?.disposition ?? '',
      rank: draft.rank ?? DEFAULT_RANK,
      participants: draft.participants ?? empty.participants,
      fieldRolls: {},
      carried: draft.groundedIn ?? [],
      ...(draft.proposalEventId === undefined ? {} : { proposalEventId: draft.proposalEventId }),
    };
  }
  if (accepted === undefined) return empty;
  const npc = state.entities[accepted.npcId]?.fields ?? {};
  return {
    npcName: accepted.npcName,
    role: accepted.role,
    goal: npc['goal'] ?? '',
    firstLook: npc['firstLook'] ?? '',
    disposition: npc['disposition'] ?? '',
    rank: accepted.rank,
    participants: [...accepted.participants],
    fieldRolls: {},
    carried: [...accepted.groundedIn],
  };
}

export function setField(form: ConnectionForm, field: ConnectionField, text: string) {
  return { ...form, [field]: text };
}

export function setRank(form: ConnectionForm, rank: ChallengeRank): ConnectionForm {
  return { ...form, rank };
}

export function toggleParticipant(
  form: ConnectionForm,
  characterId: CharacterId,
  shares: boolean,
): ConnectionForm {
  const others = form.participants.filter((id) => id !== characterId);
  return { ...form, participants: shares ? [...others, characterId] : others };
}

/**
 * A field-level roll lands: its rows become the field's words, and the rolls
 * its citation. A name is its given and family rolls, in that order.
 */
export function applyFieldRoll(
  form: ConnectionForm,
  field: ConnectionField,
  rolls: readonly { readonly eventId: EventId; readonly text: string }[],
): ConnectionForm {
  const text = rolls.map((roll) => withoutLinks(roll.text).trim()).join(' ');
  return {
    ...setField(form, field, text),
    fieldRolls: { ...form.fieldRolls, [field]: rolls.map((roll) => roll.eventId) },
  };
}

export type ConnectionProposal = Extract<
  PayloadFor<'creation.proposed'>,
  { readonly targetKind: 'connection' }
>['proposal'];

export interface HeldConnectionProposal {
  readonly eventId: EventId;
  readonly proposal: ConnectionProposal;
  readonly rationale: string;
}

/** The Guide's latest connection proposal, from the fold, so it survives a reload (D-161). */
export function heldConnectionProposal(state: CampaignState): HeldConnectionProposal | null {
  const held = state.launch.proposals[CONNECTION_PROPOSAL_TARGET];
  if (held === undefined || held.targetKind !== 'connection') return null;
  return { eventId: held.eventId, proposal: held.proposal, rationale: held.rationale };
}

/**
 * Take some or all of a proposal's fields. The proposal's id comes with them,
 * so acceptance names it; a field taken this way sheds its own field roll,
 * because its words now come from the proposal's rolls. The rank and the
 * sharing crew were never proposed (D-167), so taking leaves them alone.
 */
export function takeConnectionProposal(
  form: ConnectionForm,
  held: HeldConnectionProposal,
  fields: readonly ConnectionField[] = CONNECTION_FIELDS,
): ConnectionForm {
  const fieldRolls = { ...form.fieldRolls };
  let next: ConnectionForm = { ...form, proposalEventId: held.eventId };
  for (const field of fields) {
    next = setField(next, field, held.proposal[field].value);
    delete fieldRolls[field];
  }
  return { ...next, fieldRolls };
}

/** Stop working from the proposal: the words stay, the link to it goes. */
export function dropConnectionProposal(form: ConnectionForm): ConnectionForm {
  const { proposalEventId: _dropped, ...rest } = form;
  return rest;
}

/** Fields whose words differ from the Guide's. Display only; the server decides provenance. */
export function editedConnectionFields(
  form: ConnectionForm,
  proposal: ConnectionProposal,
): readonly ConnectionField[] {
  return CONNECTION_FIELDS.filter((field) => proposal[field].value.trim() !== form[field].trim());
}

/** The citations this version is built on: carried ones and field rolls, once each. */
export function connectionGrounding(form: ConnectionForm): readonly EventId[] {
  return [...new Set([...form.carried, ...Object.values(form.fieldRolls).flat()])];
}

export type SaveConnectionBody = Omit<EstablishLaunchConnectionRequestBody, 'commandId'>;

/**
 * The body of the accepting command, or `null` while the command would refuse
 * it: it needs a name, a role and at least one crew member sharing it.
 */
export function toConnectionRequest(form: ConnectionForm): SaveConnectionBody | null {
  if (form.npcName.trim() === '' || form.role.trim() === '' || form.participants.length === 0)
    return null;
  const details = {
    ...(form.goal.trim() === '' ? {} : { goal: form.goal.trim() }),
    ...(form.firstLook.trim() === '' ? {} : { firstLook: form.firstLook.trim() }),
    ...(form.disposition.trim() === '' ? {} : { disposition: form.disposition.trim() }),
  };
  const groundedIn = connectionGrounding(form);
  return {
    npcName: form.npcName.trim(),
    role: form.role.trim(),
    rank: form.rank,
    participants: [...form.participants],
    ...(Object.keys(details).length > 0 ? { details } : {}),
    ...(form.proposalEventId === undefined ? {} : { proposalEventId: form.proposalEventId }),
    ...(groundedIn.length > 0 ? { groundedIn: [...groundedIn] } : {}),
  };
}

/**
 * The body of **Save and continue**: the connection, and the troubles exactly
 * as the draft already holds them.
 */
export function toConnectionDraft(
  state: CampaignState,
  form: ConnectionForm,
): LaunchDraftFor<'connection_troubles'> {
  const saved = state.launch.drafts.connection_troubles?.snapshot;
  const groundedIn = connectionGrounding(form);
  return {
    connection: {
      npcName: form.npcName,
      role: form.role,
      rank: form.rank,
      participants: [...form.participants],
      details: { goal: form.goal, firstLook: form.firstLook, disposition: form.disposition },
      ...(groundedIn.length > 0 ? { groundedIn: [...groundedIn] } : {}),
      ...(form.proposalEventId === undefined ? {} : { proposalEventId: form.proposalEventId }),
    },
    troubles: [...(saved?.troubles ?? [])],
  };
}

/** The accepted connection's progress track, as the section shows it. */
export function connectionTrack(state: CampaignState):
  | {
      readonly title: string;
      readonly rank: string;
      readonly boxes: number;
      readonly sharedBy: readonly string[];
    }
  | undefined {
  const connection = state.launch.connection;
  if (connection === undefined) return undefined;
  const track = state.tracks[connection.trackId];
  const nameOf = (id: string) =>
    Object.values(state.characters).find((character) => character.id === id)?.name ?? id;
  return {
    title: track?.title ?? `Connection: ${connection.npcName}`,
    rank: connection.rank,
    boxes: Math.floor((track?.ticks ?? 0) / 4),
    sharedBy: (track?.participantCharacterIds ?? connection.participants).map(nameOf),
  };
}
