import { STARFORGED } from '@astrolabe/rules';
import type { OracleId } from '@astrolabe/rules';
import type {
  CampaignState,
  DecideLaunchTruthRequestBody,
  EventId,
  LaunchDraftFor,
} from '@astrolabe/shared';

/**
 * The Truths section's form: what it opens with, and what it sends (5.1, 5.2).
 *
 * **What a truths draft holds.** Foundation is one fact with one accepted
 * command, so its draft and its acceptance cover the same ground. Truths are
 * fourteen facts with a command each: a truth is accepted on its own, the
 * moment the player chooses, rolls, writes or leaves it open. The section's
 * draft therefore holds *unaccepted* work — a half-written custom answer, an
 * option selected but not yet confirmed — so that leaving mid-thought and
 * coming back returns the player to what was in front of them (A23, D-161).
 * Every later multi-fact section should read this paragraph before inventing
 * its own answer.
 *
 * **Precedence is per truth, not per section** (D-182). The draft is one
 * snapshot with one `seq`; each accepted truth carries its own. So a draft
 * saved before a truth was accepted loses to that truth and still wins for its
 * thirteen neighbours. A whole-section comparison would silently discard work
 * on every other truth the moment one was accepted.
 */

export interface TruthSelection {
  readonly resolution?: 'selected' | 'rolled' | 'custom' | 'leave_open';
  readonly optionIndex?: number;
  readonly subchoiceId?: string;
  readonly subchoiceOptionIndex?: number;
  readonly text?: string;
  /**
   * The Guide recommendation this selection came from, if the player took one
   * (D-161).
   *
   * Session intent, not a fact: it is set by taking the Guide's answer and
   * cleared by every manual move away from it, so the decision carries it only
   * when the player really did start from what the Guide said. Nothing clears
   * `launch.proposals`, so reading the held proposal at decide time instead
   * would attach a recommendation from an hour ago to a revision the player
   * made unaided.
   *
   * It is deliberately not part of the draft snapshot: a draft records what
   * the player wrote, not how they arrived at it.
   */
  readonly fromProposalEventId?: EventId;
}

/**
 * The form transitions, as functions rather than as `onChange` bodies.
 *
 * They live here because vitest collects `*.test.ts` and nothing else: a
 * transition written inline in a component is a transition nothing checks.
 * The first one written inline dropped the player's typed answer the moment
 * they clicked an option to compare it against.
 */

/** Choose an official option, keeping any answer the player has already typed. */
export function selectOption(selection: TruthSelection, optionIndex: number): TruthSelection {
  return {
    resolution: 'selected',
    optionIndex,
    // `text` survives, because a player who types an answer and then clicks an
    // option to read it is comparing, not discarding.
    ...(selection.text !== undefined ? { text: selection.text } : {}),
    // The nested choice does not: it belongs to the option that was chosen
    // before, and an index carried across can land on a valid row of a
    // different table by coincidence.
  };
}

/** Choose the nested option a chosen option requires (A25). */
export function selectSubchoice(
  selection: TruthSelection,
  subchoiceOptionIndex: number,
): TruthSelection {
  return { ...selection, subchoiceOptionIndex };
}

/** Write your own answer. */
export function writeCustom(selection: TruthSelection, text: string): TruthSelection {
  // The option and its nested choice go: this is a different answer, not a
  // decorated version of the one above it. Anything the Guide suggested goes
  // with them — these are the player's own words now.
  void selection;
  return { resolution: 'custom', text };
}

export type TruthsForm = Readonly<Record<string, TruthSelection>>;

export function initialTruthsForm(state: CampaignState): TruthsForm {
  const draft = state.launch.drafts.truths;
  const drafted = new Map(
    (draft?.snapshot.decisions ?? []).map((decision) => [decision.truthId as string, decision]),
  );

  const form: Record<string, TruthSelection> = {};
  for (const truth of STARFORGED.truths) {
    const accepted = state.launch.truthDecisions[truth.id];
    const draftedDecision = drafted.get(truth.id);
    const draftIsNewer =
      draft !== undefined &&
      draftedDecision !== undefined &&
      (accepted === undefined || draft.seq > accepted.seq);
    const source = draftIsNewer ? draftedDecision : (accepted ?? draftedDecision);
    if (source === undefined) continue;

    // Field by field, never by spreading: an accepted fact also carries
    // `provenance`, `groundedIn`, `eventId`, `seq` and a recorded quest
    // starter, and none of that is form state.
    //
    // `text` is the custom answer's field, so it is carried only for the
    // custom path. On a chosen or rolled truth `text` is the option's own
    // description, and copying it in would put the book's words into the box
    // labelled "your own answer" the moment the player looked at it.
    form[truth.id] = {
      ...(source.resolution !== undefined ? { resolution: source.resolution } : {}),
      ...(source.optionIndex !== undefined ? { optionIndex: source.optionIndex } : {}),
      ...(source.subchoiceId !== undefined ? { subchoiceId: source.subchoiceId } : {}),
      ...(source.subchoiceOptionIndex !== undefined
        ? { subchoiceOptionIndex: source.subchoiceOptionIndex }
        : {}),
      ...(source.resolution === 'custom' && source.text !== undefined ? { text: source.text } : {}),
    };
  }
  return form;
}

/** The body of **Save and continue**: durable, and deliberately not canon. */
export function toDraftSnapshot(form: TruthsForm): LaunchDraftFor<'truths'> {
  return {
    decisions: STARFORGED.truths.flatMap((truth) => {
      const selection = form[truth.id];
      if (selection === undefined) return [];
      // `fromProposalEventId` is session intent, not something the player
      // wrote, and the draft schema has no field for it.
      const { fromProposalEventId: _ignored, ...snapshot } = selection;
      return [{ truthId: truth.id, ...snapshot }];
    }),
  };
}

export type DecideTruthBody = Omit<DecideLaunchTruthRequestBody, 'commandId'>;

/**
 * The body of one truth's decision, or `null` when the selection is not yet a
 * decision.
 *
 * The server refuses each of these cases by name — `invalid_option`,
 * `subchoice_required`, `custom_text_required` — so a screen that sent them
 * anyway would turn a control it should have disabled into a 422. Anticipated
 * here rather than discovered, exactly as Foundation's `toFoundationRequest`
 * anticipates `premise_required`.
 *
 * A **rolled** truth needs nothing but the intent: the server rolls, and the
 * client neither picks the row nor sends one (section 9, section 4).
 */
export function toDecideRequest(
  truthId: OracleId,
  selection: TruthSelection,
): DecideTruthBody | null {
  const truth = STARFORGED.truths.find((candidate) => candidate.id === truthId);
  if (truth === undefined) return null;

  switch (selection.resolution) {
    case 'rolled':
      return { truthId, resolution: 'rolled' };
    case 'leave_open':
      return { truthId, resolution: 'leave_open' };
    case 'custom': {
      const text = selection.text?.trim() ?? '';
      return text === ''
        ? null
        : { truthId, resolution: 'custom', text, ...fromProposal(selection) };
    }
    case 'selected': {
      const option =
        selection.optionIndex === undefined ? undefined : truth.rows[selection.optionIndex];
      if (option === undefined || selection.optionIndex === undefined) return null;
      if (option.subchoice === undefined) {
        return {
          truthId,
          resolution: 'selected',
          optionIndex: selection.optionIndex,
          ...fromProposal(selection),
        };
      }
      // A25: the nested choice is part of the same accepted truth, so an option
      // that has one is not decidable without it.
      const nested = selection.subchoiceOptionIndex;
      if (nested === undefined || option.subchoice.rows[nested] === undefined) return null;
      return {
        truthId,
        resolution: 'selected',
        optionIndex: selection.optionIndex,
        subchoiceId: option.subchoice.id,
        subchoiceOptionIndex: nested,
        ...fromProposal(selection),
      };
    }
    default:
      return null;
  }
}

/**
 * The truths whose selection on screen says something the server does not
 * hold yet.
 *
 * This is what **Save and continue** is for, and what lets the screen warn
 * about leaving with unsaved words.
 *
 * Only truths the player has actually touched are considered. A truth the
 * server settled on its own — rolled, say, where the player picked no option —
 * has an entry in the baseline and none in the form, and reading that as a
 * difference would warn about work nobody did.
 */
/**
 * The proposal reference, on the two resolutions that can accept one.
 *
 * The server refuses the other two by name, and it is right to: rolling is not
 * accepting a recommendation — the Guide never rolls (section 4) — and leaving
 * a truth open is a decision the Guide cannot make for the player (D-162).
 */
function fromProposal(selection: TruthSelection): { proposalEventId?: EventId } {
  return selection.fromProposalEventId === undefined
    ? {}
    : { proposalEventId: selection.fromProposalEventId };
}

export function unsavedTruths(form: TruthsForm, baseline: TruthsForm): readonly string[] {
  return Object.keys(form).filter((id) => !sameSelection(form[id], baseline[id]));
}

function sameSelection(a: TruthSelection | undefined, b: TruthSelection | undefined): boolean {
  return (
    a?.resolution === b?.resolution &&
    a?.optionIndex === b?.optionIndex &&
    a?.subchoiceId === b?.subchoiceId &&
    a?.subchoiceOptionIndex === b?.subchoiceOptionIndex &&
    (a?.text ?? '') === (b?.text ?? '')
  );
}
