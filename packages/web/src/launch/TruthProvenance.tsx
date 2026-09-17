import { useId, useState } from 'react';

import { oracleTableName } from './truths.js';
import type { TruthAnswerView, TruthView } from './truths.js';
import styles from './TruthProvenance.module.css';

/**
 * Where an accepted truth came from, and what it used to say (A41, A26).
 *
 * The badge is a word — "Chosen", "Rolled", "Suggested by the Guide, edited" —
 * because provenance is meaning and meaning is never carried by colour alone
 * (section 10). A rolled answer brings its oracle chips: the table and the
 * number that came up, so the player can see the roll behind the sentence
 * rather than take the sentence on trust.
 *
 * Revisions are a disclosure rather than a list always on screen. The current
 * answer is what the campaign says; the earlier ones are there because A26 asks
 * that changing your mind leave a record, not because they compete for
 * attention.
 */
export function TruthProvenance({ view }: { readonly view: TruthView }) {
  const [open, setOpen] = useState(false);
  const historyId = useId();

  if (view.answer === undefined) return null;

  return (
    <div className={styles.provenance}>
      <Answer answer={view.answer} />

      {view.history.length > 0 && (
        <>
          <button
            type="button"
            className={styles.quiet}
            aria-expanded={open}
            aria-controls={historyId}
            onClick={() => setOpen((current) => !current)}
          >
            {view.history.length === 1
              ? 'One earlier answer'
              : `${view.history.length} earlier answers`}
          </button>
          <ol className={styles.history} id={historyId} hidden={!open}>
            {view.history.map((entry) => (
              <li key={entry.eventId}>
                <Answer answer={entry} superseded />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function Answer({
  answer,
  superseded = false,
}: {
  readonly answer: TruthAnswerView;
  readonly superseded?: boolean;
}) {
  return (
    <div className={styles.answer}>
      <p className={styles.badges}>
        <span className={styles.badge}>{answer.provenanceText}</span>
        {superseded && <span className={styles.superseded}>Replaced</span>}
      </p>
      {answer.text !== undefined && <p className={styles.text}>{answer.text}</p>}
      {answer.subchoiceText !== undefined && (
        <p className={styles.nested}>
          <span className={styles.nestedLabel}>Also:</span> {answer.subchoiceText}
        </p>
      )}
      {answer.questStarter !== undefined && (
        // A25, D-162: recorded on the answer, and still not part of it.
        <p className={styles.starter}>
          <span className={styles.starterLabel}>Quest starter (inspiration only):</span>{' '}
          {answer.questStarter}
        </p>
      )}
      {answer.chips.length > 0 && (
        <ul className={styles.chips}>
          {answer.chips.map((chip) => (
            <li className={`${styles.chip} ${chip.voided ? styles.voided : ''}`} key={chip.eventId}>
              <span className={styles.chipTable}>{oracleTableName(chip.oracleId)}</span>
              <span className={styles.chipRoll}>{chip.roll}</span>
              <span className={styles.chipRow}>{chip.rowText}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
