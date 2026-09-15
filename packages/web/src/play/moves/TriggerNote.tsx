import type { PayloadFor } from '@astrolabe/shared';

import { confidenceLabel } from './suggestion.js';
import styles from './TriggerNote.module.css';

export type TriggerNotePayload = Pick<
  PayloadFor<'move.trigger_noted'>,
  'triggerText' | 'reason' | 'confidence'
>;

/**
 * D-136: the Guide's note that a move's trigger may not fit what the player
 * described. A remark, not a verdict: the roll stands, and the player may
 * ignore it or void and redo the move. Shown on the result card and with
 * the move in the log.
 */
export function TriggerNote({ note }: { readonly note: TriggerNotePayload }) {
  return (
    <div className={styles.note} role="note">
      <span className={styles.badge}>Guide</span>
      <span className={styles.body}>
        <span className={styles.headline}>This move’s trigger may not fit what you described.</span>{' '}
        {note.reason}
        <details className={styles.why}>
          <summary>Why?</summary>
          <blockquote className={styles.quote}>{note.triggerText}</blockquote>
          <p className={styles.line}>
            {confidenceLabel(note.confidence)}. The roll stands; void and redo it if you agree.
          </p>
        </details>
      </span>
    </div>
  );
}
