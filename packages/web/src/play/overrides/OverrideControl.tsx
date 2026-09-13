import { useState } from 'react';

import type { OverrideRequestBody } from '@astrolabe/shared';

import { ApiError } from '../../api/http.js';
import { useOverride } from '../../api/narration.js';

import styles from './OverrideControl.module.css';

/**
 * A16 / D-117 / Beat 9: edit a meter, momentum, or a track's ticks by hand.
 *
 * The value always shows; a value last set by a manual override carries an
 * "edited" marker in text, not only in color (§10), so a manual override
 * reads differently from an automated change. Editing opens inline — a
 * number and an optional reason — and the server checks the bounds again,
 * since the client's are only a convenience.
 */
export function OverrideControl({
  campaignId,
  target,
  label,
  value,
  min,
  max,
  overridden,
  format = String,
}: {
  readonly campaignId: string;
  readonly target: OverrideRequestBody['target'];
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly overridden: boolean;
  readonly format?: (value: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [reason, setReason] = useState('');
  const override = useOverride(campaignId);

  const problem =
    override.error instanceof ApiError
      ? ((override.error.body as { problem?: string } | undefined)?.problem ??
        'That value was refused.')
      : override.error !== null
        ? 'The edit could not be saved.'
        : undefined;

  async function save() {
    await override.mutateAsync({
      target,
      to: draft,
      ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
    });
    setEditing(false);
    setReason('');
  }

  if (!editing) {
    return (
      <span className={styles.value}>
        <span className={styles.label}>{label}</span>
        <span>{format(value)}</span>
        {overridden && <span className={styles.edited}>edited</span>}
        <button
          type="button"
          className={styles.edit}
          aria-label={`Edit ${label}`}
          onClick={() => {
            setDraft(value);
            override.reset();
            setEditing(true);
          }}
        >
          Edit
        </button>
      </span>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void save().catch(() => undefined);
      }}
    >
      <label className={styles.label}>
        {label}
        <input
          type="number"
          className={styles.number}
          min={min}
          max={max}
          value={draft}
          onChange={(event) => setDraft(Number(event.target.value))}
        />
      </label>
      <input
        type="text"
        className={styles.reason}
        placeholder="Why? (optional)"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button
        type="submit"
        className={styles.save}
        disabled={override.isPending || Number.isNaN(draft)}
      >
        {override.isPending ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className={styles.edit} onClick={() => setEditing(false)}>
        Cancel
      </button>
      {problem !== undefined && <span className={styles.problem}>{problem}</span>}
    </form>
  );
}
