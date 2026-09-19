import { withoutLinks } from '@astrolabe/rules';
import type { CampaignState, EventId, LaunchDraftFor } from '@astrolabe/shared';

import type { TroubleRequestBody } from './sector-form.js';

/**
 * The sector trouble's form (8.5, D-194): the Troubles half of Connection and
 * Troubles, built by group 8. Every transition is here, not in the `.tsx`.
 *
 * The section's one draft also holds the connection, which group 9 builds.
 * **Save and continue here keeps whatever connection the draft already holds**,
 * so saving the troubles never erases work saved on the other half.
 */

export interface SectorTroubleForm {
  readonly text: string;
  readonly rolls: readonly EventId[];
  /** The Guide's reading of the roll, while the words are still its (D-198). */
  readonly proposalEventId?: EventId;
}

export const EMPTY_SECTOR_TROUBLE: SectorTroubleForm = { text: '', rolls: [] };

/** The accepted sector trouble or the drafted one, whichever was written last (D-182). */
export function initialSectorTrouble(state: CampaignState): SectorTroubleForm {
  const accepted = Object.values(state.launch.troubles).find(
    (trouble) => trouble.kind === 'sector',
  );
  const saved = state.launch.drafts.connection_troubles;
  const drafted = saved?.snapshot.troubles.find((trouble) => trouble.kind === 'sector');
  if (
    drafted !== undefined &&
    saved !== undefined &&
    (accepted === undefined || saved.seq > accepted.seq)
  )
    return { text: drafted.text ?? '', rolls: [] };
  if (accepted === undefined) return EMPTY_SECTOR_TROUBLE;
  return { text: accepted.text, rolls: [...accepted.groundedIn] };
}

export function setSectorTroubleText(form: SectorTroubleForm, text: string): SectorTroubleForm {
  return { ...form, text };
}

/**
 * The sector-trouble recipe lands: its row is the trouble, the roll its
 * grounding (A41). A roll replaces the trouble outright, so it takes no form.
 */
export function applySectorTroubleRoll(
  results: readonly { readonly slot: string; readonly eventId: EventId; readonly text: string }[],
): SectorTroubleForm {
  // Every result the slot yielded: a trouble row can embed other tables (8.5).
  return {
    text: results.map((result) => withoutLinks(result.text).trim()).join(' + '),
    rolls: results.map((result) => result.eventId),
  };
}

/** Take the Guide's reading of the roll; the roll stays the grounding. */
export function takeSectorTroubleProposal(
  form: SectorTroubleForm,
  held: { readonly eventId: EventId; readonly text: string },
): SectorTroubleForm {
  return { ...form, text: held.text, proposalEventId: held.eventId };
}

export function toSectorTroubleRequest(form: SectorTroubleForm): TroubleRequestBody | null {
  if (form.text.trim() === '') return null;
  return {
    trouble: { kind: 'sector', text: form.text.trim() },
    ...(form.proposalEventId === undefined ? {} : { proposalEventId: form.proposalEventId }),
    ...(form.rolls.length > 0 ? { groundedIn: [...form.rolls] } : {}),
  };
}

/**
 * The body of **Save and continue**: the sector trouble, and the connection and
 * any other drafted trouble exactly as the draft already holds them.
 */
export function toTroublesDraft(
  state: CampaignState,
  form: SectorTroubleForm,
): LaunchDraftFor<'connection_troubles'> {
  const saved = state.launch.drafts.connection_troubles?.snapshot;
  return {
    ...(saved?.connection === undefined ? {} : { connection: saved.connection }),
    troubles: [
      ...(saved?.troubles ?? []).filter((trouble) => trouble.kind !== 'sector'),
      { kind: 'sector', text: form.text },
    ],
  };
}
