import { STARFORGED } from '@astrolabe/rules';
import type { OracleId, SettingTruth, TruthOption } from '@astrolabe/rules';
import type {
  CampaignState,
  EventId,
  LaunchProvenance,
  OracleChip,
  PayloadFor,
} from '@astrolabe/shared';

/**
 * The Truths section, as the screen reads it (5.1, 5.2).
 *
 * Fourteen questions in the book's order, each with whatever the campaign has
 * decided about it. Everything here is presentation over facts the server
 * already settled: which option was chosen, what was rolled, which rolls a
 * decision cites. No status is recomputed and no answer re-derived — that is
 * D-176's rule, and Truths is the first section with enough moving parts to be
 * tempted by it.
 *
 * Chips arrive resolved from `GET /launch`, keyed by event id. A decision
 * carries only the ids it cites; the table and the number that came up live in
 * the roll event, which the client never sees.
 */

export type TruthStatus = 'not_decided' | 'answered' | 'left_open';

/**
 * Words, never colour alone (design record section 10). "Left open" reads as
 * the decision it is — D-162's whole point is that it is not a truth someone
 * skipped.
 */
export const TRUTH_STATUS_TEXT: Record<TruthStatus, string> = {
  not_decided: 'Not decided',
  answered: 'Answered',
  left_open: 'Left open',
};

/** A41's badge, in the words the page shows. */
export const PROVENANCE_TEXT: Record<LaunchProvenance, string> = {
  official_choice: 'Chosen',
  oracle_roll: 'Rolled',
  player_written: 'Written',
  guide_proposal: 'Suggested by the Guide',
  guide_proposal_edited: 'Suggested by the Guide, edited',
};

export interface TruthOptionView {
  readonly index: number;
  readonly summary: string;
  readonly description: string;
  /**
   * D-162, A25: inspiration a chosen option offers the incident, never part of
   * the answer. It keeps its own field so a component cannot concatenate it
   * into one by accident.
   */
  readonly questStarter?: string;
  readonly subchoice?: {
    readonly id: string;
    readonly name: string;
    readonly options: readonly { readonly index: number; readonly text: string }[];
  };
}

export interface TruthAnswerView {
  readonly eventId: EventId;
  readonly seq: number;
  readonly resolution: 'selected' | 'rolled' | 'custom' | 'leave_open';
  readonly provenance: LaunchProvenance;
  readonly provenanceText: string;
  /** The resolved answer. Absent only for a truth left open, which has none. */
  readonly text?: string;
  /** The short form for an overview line, when the answer came from an option. */
  readonly summary?: string;
  readonly questStarter?: string;
  /** The nested choice, resolved to its words (A25). */
  readonly subchoiceText?: string;
  /** The rolls this answer cites, resolved (A41). Empty unless it was rolled. */
  readonly chips: readonly OracleChip[];
}

export interface TruthView {
  readonly truthId: OracleId;
  readonly name: string;
  readonly characterPrompt?: string;
  readonly options: readonly TruthOptionView[];
  readonly status: TruthStatus;
  readonly statusText: string;
  /** The line the overview shows: the answer's short form, or that there is none. */
  readonly overviewText: string;
  readonly answer?: TruthAnswerView;
  /** Earlier answers, oldest first (A26). Empty unless the truth was revised. */
  readonly history: readonly TruthAnswerView[];
}

export function buildTruths(
  state: CampaignState,
  chips: Readonly<Record<EventId, OracleChip>> = {},
): readonly TruthView[] {
  return STARFORGED.truths.map((truth) => buildTruth(truth, state, chips));
}

function buildTruth(
  truth: SettingTruth,
  state: CampaignState,
  chips: Readonly<Record<EventId, OracleChip>>,
): TruthView {
  const decision = state.launch.truthDecisions[truth.id];
  const answer =
    decision === undefined
      ? undefined
      : buildAnswer(truth, decision, decision.eventId, decision.seq, chips);
  const history = (state.launch.truthHistory[truth.id] ?? []).map((entry) =>
    buildAnswer(truth, entry, entry.eventId, entry.seq, chips),
  );
  const status: TruthStatus =
    answer === undefined
      ? 'not_decided'
      : answer.resolution === 'leave_open'
        ? 'left_open'
        : 'answered';

  return {
    truthId: truth.id,
    name: truth.name,
    ...(truth.characterPrompt !== undefined ? { characterPrompt: truth.characterPrompt } : {}),
    options: truth.rows.map(toOptionView),
    status,
    statusText: TRUTH_STATUS_TEXT[status],
    overviewText: overviewText(status, answer),
    ...(answer !== undefined ? { answer } : {}),
    history,
  };
}

function toOptionView(option: TruthOption, index: number): TruthOptionView {
  return {
    index,
    summary: option.summary,
    description: option.description,
    ...(option.questStarter !== undefined ? { questStarter: option.questStarter } : {}),
    ...(option.subchoice === undefined
      ? {}
      : {
          subchoice: {
            id: option.subchoice.id,
            name: option.subchoice.name,
            options: option.subchoice.rows.map((row, rowIndex) => ({
              index: rowIndex,
              text: row.text,
            })),
          },
        }),
  };
}

function buildAnswer(
  truth: SettingTruth,
  decision: PayloadFor<'truth.decided'>,
  eventId: EventId,
  seq: number,
  chips: Readonly<Record<EventId, OracleChip>>,
): TruthAnswerView {
  const option = decision.optionIndex === undefined ? undefined : truth.rows[decision.optionIndex];
  const subchoiceText =
    option?.subchoice === undefined || decision.subchoiceOptionIndex === undefined
      ? undefined
      : option.subchoice.rows[decision.subchoiceOptionIndex]?.text;

  return {
    eventId,
    seq,
    resolution: decision.resolution,
    provenance: decision.provenance,
    provenanceText: PROVENANCE_TEXT[decision.provenance],
    ...(decision.text !== undefined ? { text: decision.text } : {}),
    ...(decision.summary !== undefined ? { summary: decision.summary } : {}),
    // Read from the decision, not from the option it names: the quest starter
    // is recorded on the answer when it is accepted, and a campaign decided
    // against an earlier rules import should still show what it was given.
    ...(decision.questStarter !== undefined ? { questStarter: decision.questStarter } : {}),
    ...(subchoiceText !== undefined ? { subchoiceText } : {}),
    // An id that names no chip resolves to nothing rather than to a blank one:
    // a roll can be voided away, and a struck chip is the narrative log's job,
    // not this page's.
    chips: decision.groundedIn.flatMap((id) => {
      const chip = chips[id];
      return chip === undefined ? [] : [chip];
    }),
  };
}

function overviewText(status: TruthStatus, answer: TruthAnswerView | undefined): string {
  if (answer === undefined) return 'No answer yet.';
  if (status === 'left_open') return 'Deliberately left open.';
  return answer.summary ?? answer.text ?? 'Answered.';
}

export interface TruthProgress {
  readonly decided: number;
  readonly total: number;
  /** Beat 2's own line. */
  readonly text: string;
}

/**
 * "14 of 14 decided" — and a truth left open counts.
 *
 * That is the distinction A24 turns on: deciding to leave a truth open answers
 * the question, it does not leave it outstanding. Counting it as undecided
 * would make the section unable to complete for a player who used a path the
 * rules offer.
 */
export function truthProgress(views: readonly TruthView[]): TruthProgress {
  const decided = views.filter((view) => view.status !== 'not_decided').length;
  return { decided, total: views.length, text: `${decided} of ${views.length} decided` };
}
