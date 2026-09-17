import { STARFORGED } from '@astrolabe/rules';
import type { OracleId } from '@astrolabe/rules';
import type {
  CampaignState,
  DecideLaunchTruthRequestBody,
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
      return selection === undefined ? [] : [{ truthId: truth.id, ...selection }];
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
      return text === '' ? null : { truthId, resolution: 'custom', text };
    }
    case 'selected': {
      const option =
        selection.optionIndex === undefined ? undefined : truth.rows[selection.optionIndex];
      if (option === undefined || selection.optionIndex === undefined) return null;
      if (option.subchoice === undefined) {
        return { truthId, resolution: 'selected', optionIndex: selection.optionIndex };
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
      };
    }
    default:
      return null;
  }
}

/**
 * Whether the form holds work no accepted truth has caught up with.
 *
 * This is what **Save and continue** is for, and what makes leaving the page
 * with unsaved words a thing the screen can warn about.
 */
export function unsavedTruths(form: TruthsForm, baseline: TruthsForm): readonly string[] {
  const ids = new Set([...Object.keys(form), ...Object.keys(baseline)]);
  return [...ids].filter((id) => !sameSelection(form[id], baseline[id]));
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
