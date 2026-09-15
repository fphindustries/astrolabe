import type { EventId } from '@astrolabe/shared';

/**
 * Pure pieces of the complication prompt (8.7, D-143 as amended), tested
 * without a DOM: what is in the box, and which offered option it started
 * from, if any.
 */

export interface ComplicationDraft {
  readonly text: string;
  readonly pick?: { readonly offeredEventId: EventId; readonly optionIndex: number };
}

/**
 * "Use this": the option's words fill the box and remember the pick. The
 * player may edit them afterwards; the pick is kept, and the server decides
 * whether the words are still the offer's.
 */
export function pickOption(
  _draft: ComplicationDraft,
  offeredEventId: EventId,
  optionIndex: number,
  text: string,
): ComplicationDraft {
  return { text, pick: { offeredEventId, optionIndex } };
}

/** What `POST /complications` is sent. */
export function submission(draft: ComplicationDraft): {
  readonly text: string;
  readonly offeredEventId?: EventId;
  readonly optionIndex?: number;
} {
  return {
    text: draft.text.trim(),
    ...(draft.pick !== undefined
      ? { offeredEventId: draft.pick.offeredEventId, optionIndex: draft.pick.optionIndex }
      : {}),
  };
}
