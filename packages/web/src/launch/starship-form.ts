import {
  buildStarshipRecipe,
  validateStarshipDetails,
  type LaunchReadiness,
  type OracleId,
  type SharedStarshipProblem,
} from '@astrolabe/rules';
import { STARSHIP_PROPOSAL_TARGET } from '@astrolabe/shared';
import type {
  CampaignState,
  EventId,
  LaunchDraftFor,
  PayloadFor,
  SaveSharedStarshipRequestBody,
} from '@astrolabe/shared';

/**
 * The Starship step's form (7.1): what it opens with, how it changes, and what
 * it sends. Every transition is here rather than in `StarshipSection.tsx`,
 * because groups 5 and 6 each found that logic in a `.tsx` is logic nothing
 * checks.
 *
 * The ship's id, asset and integrity are not form state: the server owns them
 * (7.0a, 7.0b). Installed modules are not either: they come from the crew
 * (D-191). What the player states is the name, appearance, history and one
 * or two quirks, and what those were built from.
 */

export type QuirkCount = 1 | 2;

/** The fields a proposal fills and a roll can answer. Quirks are one field per slot. */
export type StarshipField = 'name' | 'appearance' | 'history' | 'quirk_1' | 'quirk_2';

/** Fields a table can answer: the declared recipe's slots (D-164, 3R.5c). */
export type RollableField = Exclude<StarshipField, 'appearance'>;

export const FIELD_LABELS: Readonly<Record<StarshipField, string>> = {
  name: 'Name',
  appearance: 'Appearance',
  history: 'History',
  quirk_1: 'First quirk',
  quirk_2: 'Second quirk',
};

/**
 * The oracle behind each rollable field, read from the declared starship
 * recipe, so a field-level Roll can reach only a table the rules put in it.
 */
export const FIELD_ORACLES: Readonly<Record<RollableField, OracleId>> = {
  name: recipeOracle('name'),
  history: recipeOracle('history'),
  quirk_1: recipeOracle('quirk_1'),
  quirk_2: recipeOracle('quirk_2'),
};

function recipeOracle(slot: RollableField): OracleId {
  const found = buildStarshipRecipe(2).rolls.find((roll) => roll.slot === slot);
  if (found === undefined) throw new Error(`The starship recipe declares no "${slot}" slot.`);
  return found.oracle;
}

export interface StarshipForm {
  readonly name: string;
  readonly appearance: string;
  readonly history: string;
  /** One entry per quirk slot; its length is the quirk count. */
  readonly quirks: readonly string[];
  /**
   * The field rolls the player made and kept, by field. A roll stays cited
   * until the field is rolled again or filled from a proposal: a rolled
   * prompt the player reworded was still what the words were built from.
   */
  readonly fieldRolls: Readonly<Partial<Record<RollableField, EventId>>>;
  /** Citations carried from an accepted ship or a restored draft (A41). */
  readonly carried: readonly EventId[];
  /**
   * The Guide proposal these words came from, from the moment the player takes
   * any of it. Whether they then edited it is the server's decision (7.0c).
   */
  readonly proposalEventId?: EventId;
}

export const EMPTY_STARSHIP_FORM: StarshipForm = {
  name: '',
  appearance: '',
  history: '',
  quirks: [''],
  fieldRolls: {},
  carried: [],
};

/**
 * The form as the player left it (D-182): the saved draft or the accepted
 * ship, whichever was written last. Read field by field, never by spreading
 * the accepted fact, which also carries the server's id and bounds.
 */
export function initialStarshipForm(state: CampaignState): StarshipForm {
  const accepted = state.launch.starship;
  const saved = state.launch.drafts.starship;
  const draft = saved?.snapshot.starship;
  const draftIsNewer =
    saved !== undefined &&
    draft !== undefined &&
    (accepted === undefined || saved.seq > accepted.seq);

  if (draftIsNewer) {
    const quirks = draft.quirks !== undefined && draft.quirks.length > 0 ? draft.quirks : [''];
    return {
      name: draft.name ?? '',
      appearance: draft.appearance ?? '',
      history: draft.history ?? '',
      quirks,
      fieldRolls: {},
      carried: draft.groundedIn ?? [],
      ...(draft.proposalEventId === undefined ? {} : { proposalEventId: draft.proposalEventId }),
    };
  }
  if (accepted === undefined) return EMPTY_STARSHIP_FORM;
  return {
    name: accepted.name,
    appearance: accepted.appearance,
    history: accepted.history,
    quirks: [...accepted.quirks],
    fieldRolls: {},
    carried: [...accepted.groundedIn],
  };
}

export function quirkCountOf(form: StarshipForm): QuirkCount {
  return form.quirks.length >= 2 ? 2 : 1;
}

export function setText(
  form: StarshipForm,
  field: 'name' | 'appearance' | 'history',
  text: string,
): StarshipForm {
  return { ...form, [field]: text };
}

export function setQuirk(form: StarshipForm, index: number, text: string): StarshipForm {
  return { ...form, quirks: form.quirks.map((quirk, i) => (i === index ? text : quirk)) };
}

/** One or two quirks. Dropping the second also drops the roll behind it. */
export function setQuirkCount(form: StarshipForm, count: QuirkCount): StarshipForm {
  if (count === quirkCountOf(form)) return form;
  if (count === 2) return { ...form, quirks: [form.quirks[0] ?? '', ''] };
  const { quirk_2: _dropped, ...fieldRolls } = form.fieldRolls;
  return { ...form, quirks: [form.quirks[0] ?? ''], fieldRolls };
}

/** A field-level roll lands: the row becomes the field's words, and the roll its citation. */
export function applyRoll(
  form: StarshipForm,
  field: RollableField,
  roll: { readonly eventId: EventId; readonly text: string },
): StarshipForm {
  const withText =
    field === 'quirk_1'
      ? setQuirk(form, 0, roll.text)
      : field === 'quirk_2'
        ? setQuirk(setQuirkCount(form, 2), 1, roll.text)
        : setText(form, field, roll.text);
  return { ...withText, fieldRolls: { ...withText.fieldRolls, [field]: roll.eventId } };
}

export type StarshipProposal = Extract<
  PayloadFor<'creation.proposed'>,
  { readonly targetKind: 'starship' }
>['proposal'];

export interface HeldStarshipProposal {
  readonly eventId: EventId;
  readonly proposal: StarshipProposal;
  readonly rationale: string;
}

/**
 * The Guide's latest ship proposal, from the fold, so it survives a reload
 * the way a truth's recommendation does. Not canon (D-161).
 */
export function heldStarshipProposal(state: CampaignState): HeldStarshipProposal | null {
  const held = state.launch.proposals[STARSHIP_PROPOSAL_TARGET];
  if (held === undefined || held.targetKind !== 'starship') return null;
  return { eventId: held.eventId, proposal: held.proposal, rationale: held.rationale };
}

/** The fields a proposal offers, in form order. */
export function proposedFields(proposal: StarshipProposal): readonly StarshipField[] {
  return [
    'name',
    'appearance',
    'history',
    ...(['quirk_1', 'quirk_2'] as const).slice(0, proposal.quirks.length),
  ];
}

export function proposedValue(proposal: StarshipProposal, field: StarshipField): string {
  if (field === 'quirk_1' || field === 'quirk_2')
    return proposal.quirks[field === 'quirk_1' ? 0 : 1]?.value ?? '';
  return proposal[field].value;
}

export function proposedReason(proposal: StarshipProposal, field: StarshipField): string {
  if (field === 'quirk_1' || field === 'quirk_2')
    return proposal.quirks[field === 'quirk_1' ? 0 : 1]?.reason ?? '';
  return proposal[field].reason;
}

/** The rolls a proposed field cites (A41). Appearance is read, not rolled. */
export function proposedGrounding(
  proposal: StarshipProposal,
  field: StarshipField,
): readonly EventId[] {
  if (field === 'appearance') return [];
  if (field === 'quirk_1' || field === 'quirk_2')
    return proposal.quirks[field === 'quirk_1' ? 0 : 1]?.groundedIn ?? [];
  return proposal[field].groundedIn;
}

/**
 * Take some or all of a proposal's fields. The proposal's id comes with them,
 * so acceptance names it; a field taken this way sheds any field roll the
 * player had made, because its words now come from the proposal's rolls.
 * Taking the quirks sets the quirk count to the proposal's.
 */
export function takeProposal(
  form: StarshipForm,
  held: HeldStarshipProposal,
  fields: readonly StarshipField[] = proposedFields(held.proposal),
): StarshipForm {
  let next: StarshipForm = { ...form, proposalEventId: held.eventId };
  const takesQuirks = fields.some((field) => field === 'quirk_1' || field === 'quirk_2');
  if (takesQuirks) next = setQuirkCount(next, held.proposal.quirks.length === 2 ? 2 : 1);
  const fieldRolls = { ...next.fieldRolls };
  for (const field of fields) {
    const value = proposedValue(held.proposal, field);
    if (field === 'quirk_1') next = setQuirk(next, 0, value);
    else if (field === 'quirk_2') next = setQuirk(next, 1, value);
    else next = setText(next, field, value);
    if (field !== 'appearance') delete fieldRolls[field];
  }
  return { ...next, fieldRolls };
}

/** Stop working from the proposal: the words stay, the link to it goes. */
export function dropProposal(form: StarshipForm): StarshipForm {
  const { proposalEventId: _dropped, ...rest } = form;
  return rest;
}

/** Fields whose words differ from what the Guide proposed. Display only; the server decides provenance. */
export function editedFields(
  form: StarshipForm,
  proposal: StarshipProposal,
): readonly StarshipField[] {
  return proposedFields(proposal).filter(
    (field) => proposedValue(proposal, field).trim() !== fieldValue(form, field).trim(),
  );
}

export function fieldValue(form: StarshipForm, field: StarshipField): string {
  if (field === 'quirk_1') return form.quirks[0] ?? '';
  if (field === 'quirk_2') return form.quirks[1] ?? '';
  return form[field];
}

/** The citations this version is built on: carried ones and field rolls, once each. */
export function groundingOf(form: StarshipForm): readonly EventId[] {
  return [...new Set([...form.carried, ...Object.values(form.fieldRolls)])];
}

/**
 * The rules' own checks on what the player stated, the same function the
 * command layer runs (7.0j). Keyed by the field a problem names.
 */
export function detailProblems(form: StarshipForm): readonly SharedStarshipProblem[] {
  return validateStarshipDetails({
    name: form.name,
    appearance: form.appearance,
    history: form.history,
    quirks: form.quirks,
  });
}

/** The body of **Save and continue**: durable, and deliberately not canon. */
export function toDraftSnapshot(form: StarshipForm): LaunchDraftFor<'starship'> {
  const groundedIn = groundingOf(form);
  return {
    starship: {
      name: form.name,
      appearance: form.appearance,
      history: form.history,
      quirks: [...form.quirks],
      ...(groundedIn.length > 0 ? { groundedIn: [...groundedIn] } : {}),
      ...(form.proposalEventId === undefined ? {} : { proposalEventId: form.proposalEventId }),
    },
  };
}

export type SaveStarshipBody = Omit<SaveSharedStarshipRequestBody, 'commandId'>;

/**
 * The body of the accepting command, or `null` while the rules would refuse
 * it: sending it anyway would turn a disabled button into a 422.
 *
 * A proposal is named only while it is the one the fold holds (10.0a, 9.2's
 * rule). Asking again replaces it, and the words left in the form are then the
 * player's own; naming the old one would be refused.
 */
export function toSaveRequest(
  form: StarshipForm,
  heldEventId: EventId | undefined,
): SaveStarshipBody | null {
  if (detailProblems(form).length > 0) return null;
  const groundedIn = groundingOf(form);
  return {
    starship: {
      name: form.name.trim(),
      appearance: form.appearance.trim(),
      history: form.history.trim(),
      quirks: form.quirks.map((quirk) => quirk.trim()),
    },
    ...(form.proposalEventId === undefined || form.proposalEventId !== heldEventId
      ? {}
      : { proposalEventId: form.proposalEventId }),
    ...(groundedIn.length > 0 ? { groundedIn: [...groundedIn] } : {}),
  };
}

export function isDirty(form: StarshipForm, baseline: StarshipForm): boolean {
  return (
    form.name !== baseline.name ||
    form.appearance !== baseline.appearance ||
    form.history !== baseline.history ||
    form.quirks.length !== baseline.quirks.length ||
    form.quirks.some((quirk, i) => quirk !== baseline.quirks[i]) ||
    form.proposalEventId !== baseline.proposalEventId
  );
}

/** The server's starship blockers, which are what completes the section (D-176). */
export function starshipBlockers(readiness: LaunchReadiness) {
  return readiness.sections.starship.blockers;
}
