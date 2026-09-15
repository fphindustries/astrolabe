import { useState } from 'react';

import type {
  CommandId,
  EventId,
  OfferComplicationsResponse,
  SetComplicationResponse,
} from '@astrolabe/shared';

import { useOfferComplications, useSetComplication } from '../../api/moves.js';
import { ApiError } from '../../api/http.js';
import { toChipView } from '../log/entries.js';
import { OracleChips } from '../oracle/OracleChips.js';
import { isSubmitChord } from '../../ui/keys.js';

import { pickOption, submission, type ComplicationDraft } from './complication.js';
import styles from './ComplicationPrompt.module.css';

/**
 * D-15, D-143 (8.7): the outcome calls for a complication and offers no
 * menu. The player writes it, or asks for the Guide's options (as often as
 * they like), picks one and may edit it. The beat can't be Done until it is
 * set (the result card holds Done back).
 */
export function ComplicationPrompt({
  campaignId,
  moveCommandId,
  clause,
  onSet,
}: {
  readonly campaignId: string;
  readonly moveCommandId: CommandId;
  /** The outcome text that calls for it. */
  readonly clause: string;
  readonly onSet: (result: SetComplicationResponse, text: string) => void;
}) {
  const [draft, setDraft] = useState<ComplicationDraft>({ text: '' });
  const [offer, setOffer] = useState<Extract<OfferComplicationsResponse, { ok: true }> | null>(
    null,
  );
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const ask = useOfferComplications(campaignId);
  const set = useSetComplication(campaignId);

  const giveOptions = () => {
    setProblem(undefined);
    ask.mutate(moveCommandId, {
      onSuccess: (response) => {
        if (response.ok) {
          setOffer(response);
        } else {
          setProblem(
            `The Guide couldn't offer options: ${response.message} You can still write one.`,
          );
        }
      },
      onError: (error) => setProblem(refusalText(error)),
    });
  };

  const confirm = () => {
    setProblem(undefined);
    const body = submission(draft);
    set.mutate(
      { moveCommandId, ...body },
      {
        onSuccess: (result) => onSet(result, body.text),
        onError: (error) => setProblem(refusalText(error)),
      },
    );
  };

  return (
    <div className={styles.prompt} role="group" aria-label="Complication">
      <p className={styles.question}>What complicates things?</p>
      <p className={styles.clause}>The outcome says: “…{clause}.”</p>

      <label className={styles.label}>
        Complication
        <textarea
          className={styles.text}
          data-focus-target
          rows={2}
          value={draft.text}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          onKeyDown={(event) => {
            if (isSubmitChord(event) && draft.text.trim().length > 0 && !set.isPending) {
              event.preventDefault();
              confirm();
            }
          }}
          placeholder="Write what complicates things, or ask for options."
        />
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={giveOptions}
          disabled={ask.isPending}
        >
          {ask.isPending
            ? 'Asking the Guide…'
            : offer === null
              ? 'Give me options'
              : 'Other options'}
        </button>
        <button
          type="button"
          className={styles.confirm}
          onClick={confirm}
          disabled={draft.text.trim().length === 0 || set.isPending}
        >
          Set complication
        </button>
      </div>

      {problem !== undefined && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      {offer !== null && (
        <ol className={styles.options}>
          {offer.options.map((option, index) => (
            <li
              key={`${offer.eventId}-${index}`}
              className={styles.option}
              data-picked={
                draft.pick?.optionIndex === index && draft.pick.offeredEventId === offer.eventId
              }
            >
              <p className={styles.optionText}>
                {option.text}
                {draft.pick?.optionIndex === index &&
                  draft.pick.offeredEventId === offer.eventId && (
                    <span className={styles.picked}> (picked)</span>
                  )}
              </p>
              <OracleChips chips={option.chips.map(toChipView)} />
              <button
                type="button"
                className={styles.secondary}
                onClick={() =>
                  setDraft(pickOption(draft, offer.eventId as EventId, index, option.text))
                }
              >
                Use this
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function refusalText(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { problem?: string } | undefined;
    if (body?.problem !== undefined) {
      return body.problem;
    }
  }
  return 'That did not go through. Try again.';
}
