import { useRef, useState } from 'react';

import { Popover } from '../../ui/Popover.js';
import { useNarrationStream } from '../narration/narration-stream.js';

import styles from './VoidControl.module.css';

/**
 * Task 7.9, A15, Beat 9: flag a passage and say what is wrong with it. One
 * action — submitting the note writes the flag and streams the rewrite into
 * the passage in place; the original and the note stay behind the log's
 * "Corrected" affordance (D-73).
 */
export function CorrectionControl({ eventId }: { readonly eventId: string }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const narration = useNarrationStream();

  function submit() {
    narration.correct(eventId, note.trim());
    setOpen(false);
    setNote('');
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={styles.trigger}
        disabled={narration.paused}
        onClick={() => setOpen(true)}
      >
        Flag
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
        <form
          className={styles.panel}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <p className={styles.summaryTitle}>What’s wrong with this passage?</p>
          <input
            type="text"
            className={styles.reason}
            placeholder="e.g. Rook is a veteran — annoyed, not shaken"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button type="submit" className={styles.rewrite} disabled={note.trim().length === 0}>
            Rewrite
          </button>
        </form>
      </Popover>
    </>
  );
}
