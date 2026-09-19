import type { OracleId } from '@astrolabe/rules';
import type { CampaignState, EventId, PayloadFor } from '@astrolabe/shared';

import type { TruthSelection } from './truth-form.js';

/**
 * The Guide's recommendation for one truth, as the panel reads it (5.3).
 *
 * Nothing here is canon (D-161). A recommendation is held beside the truth
 * until the player accepts it, and accepting is the ordinary `decideTruth`
 * command the manual paths use — with the proposal named, so the server can
 * record the decision as the Guide's and say whether the player edited it.
 *
 * The client never claims that provenance itself. It says which proposal it is
 * accepting; the server compares and decides. "Did the player edit it" is a
 * fact about the player, and a screen has every incentive to get it wrong by
 * accident.
 */

export interface HeldProposal {
  readonly truthId: OracleId;
  readonly proposalEventId: EventId;
  /** The Guide recommends an official option or the player's own words, never a roll. */
  readonly resolution: 'selected' | 'custom';
  readonly optionIndex?: number;
  readonly text?: string;
  readonly questStarter?: string;
  /** Why the Guide recommends it — shown, because an unexplained proposal is not a proposal. */
  readonly rationale: string;
}

/**
 * The recommendation the campaign is holding for this truth, if any.
 *
 * Read from projected state rather than from the response that created it, so
 * a reload does not lose it: a proposal is an event like anything else, and
 * the panel that survives a refresh is the one A23 asks for.
 */
export function heldProposal(state: CampaignState, truthId: OracleId): HeldProposal | null {
  const proposal = state.launch.proposals[truthId];
  if (proposal === undefined || proposal.targetKind !== 'truth') return null;
  const held = proposal.proposal;
  // A proposal whose resolution the schema allows but which named nothing
  // usable is not shown as a recommendation. The server re-asks for these, so
  // one reaching here means something changed underneath; rendering an empty
  // panel would be worse than rendering none.
  const resolution = held.resolution;
  if (resolution === undefined) return null;
  if (resolution === 'selected' && held.optionIndex === undefined) return null;
  if (resolution === 'custom' && (held.text ?? '').trim() === '') return null;

  return {
    truthId,
    proposalEventId: proposal.eventId,
    resolution,
    ...(held.optionIndex !== undefined ? { optionIndex: held.optionIndex } : {}),
    ...(held.text !== undefined ? { text: held.text } : {}),
    ...(held.questStarter !== undefined ? { questStarter: held.questStarter } : {}),
    rationale: proposal.rationale,
  };
}

/**
 * What the form becomes when the player takes the recommendation.
 *
 * The selection carries the proposal's event id from here on, so whichever
 * button the player finally presses records the decision as the Guide's. Every
 * manual move away from it clears the reference again, which is why this is
 * the only place that sets it.
 */
export function proposalSelection(held: HeldProposal): TruthSelection {
  const from = { fromProposalEventId: held.proposalEventId };
  return held.resolution === 'selected'
    ? {
        resolution: 'selected',
        ...(held.optionIndex !== undefined ? { optionIndex: held.optionIndex } : {}),
        ...from,
      }
    : { resolution: 'custom', ...(held.text !== undefined ? { text: held.text } : {}), ...from };
}

/**
 * Whether what is about to be accepted still says what the Guide said.
 *
 * The server decides the recorded provenance; this only drives what the panel
 * tells the player before they commit — "Accept the Guide's answer" against
 * "Accept your edit of it". Keeping the same comparison in both places is
 * deliberate, and the server's is the one that counts.
 */
export function isEditedProposal(held: HeldProposal, selection: TruthSelection): boolean {
  if (selection.resolution !== held.resolution) return true;
  return held.resolution === 'selected'
    ? selection.optionIndex !== held.optionIndex
    : (selection.text ?? '').trim() !== (held.text ?? '').trim();
}

/**
 * A proposal can only be accepted by a chosen or written answer, matching the
 * server's own refusal. Rolling is not accepting a recommendation — the Guide
 * never rolls (section 4) — and leaving a truth open is a decision about the
 * campaign that the Guide cannot make for the player (D-162).
 */
export function acceptsProposal(selection: TruthSelection): boolean {
  return selection.resolution === 'selected' || selection.resolution === 'custom';
}

export type TruthProposalPayload = Extract<
  PayloadFor<'creation.proposed'>,
  { targetKind: 'truth' }
>;
