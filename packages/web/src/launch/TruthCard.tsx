import { useId, useState } from 'react';

import type { TruthSelection } from './truth-form.js';
import { toDecideRequest, type DecideTruthBody } from './truth-form.js';
import type { TruthView } from './truths.js';
import { TruthProvenance } from './TruthProvenance.js';
import { TruthStatusChip } from './TruthStatusChip.js';
import styles from './TruthCard.module.css';

/**
 * One setting truth, and the four ways to answer it (5.2, D-162).
 *
 * A disclosure rather than a page of its own: fourteen routes would be
 * navigation for its own sake, and the overview is where the player works.
 *
 * The four paths are the ones D-162 names and the server implements — choose
 * an official option, have the server roll, write your own, or leave the truth
 * deliberately open. **Roll** sends only the intent: the server rolls the truth
 * table and, for an option with a nested table, that too (section 4, section 9).
 */
export function TruthCard({
  view,
  selection,
  onSelect,
  onDecide,
  pending,
  children,
}: {
  readonly view: TruthView;
  readonly selection: TruthSelection;
  readonly onSelect: (selection: TruthSelection) => void;
  readonly onDecide: (body: DecideTruthBody) => void;
  readonly pending: boolean;
  /** The Guide's panel for this truth (5.3), rendered by the section. */
  readonly children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const group = useId();

  const chosen =
    selection.optionIndex === undefined ? undefined : view.options[selection.optionIndex];
  const ready = toDecideRequest(view.truthId, selection);

  const decide = (body: DecideTruthBody | null) => {
    if (body !== null) onDecide(body);
  };

  return (
    <article className={styles.card}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true" className={styles.caret}>
            {open ? '▾' : '▸'}
          </span>
          {view.name}
        </button>
        <TruthStatusChip status={view.status} />
      </h3>
      <p className={styles.overview}>{view.overviewText}</p>

      <div className={styles.body} id={bodyId} hidden={!open}>
        {view.characterPrompt !== undefined && (
          <p className={styles.prompt}>{view.characterPrompt}</p>
        )}

        {/* The accepted answer and where it came from, above the controls that
            would change it: what the campaign says now, then how to revise it
            (A26 — a revision leaves the earlier answer readable). */}
        <TruthProvenance view={view} />

        <fieldset className={styles.options}>
          <legend className={styles.legend}>Answers to {view.name}</legend>
          {view.options.map((option) => (
            <label className={styles.option} key={option.index}>
              <input
                type="radio"
                name={group}
                // Named explicitly rather than by the label that wraps it. The
                // label holds the option's whole description and its quest
                // starter, and an accessible name built from all of that would
                // read the inspiration as part of the answer — the one thing
                // A25 asks the page not to do.
                aria-label={option.summary}
                checked={
                  selection.resolution === 'selected' && selection.optionIndex === option.index
                }
                onChange={() => onSelect({ resolution: 'selected', optionIndex: option.index })}
              />
              <span className={styles.optionBody}>
                <span className={styles.optionSummary}>{option.summary}</span>
                <span className={styles.optionDescription}>{option.description}</span>
                {option.questStarter !== undefined && (
                  // A25, D-162: labelled in the text itself, not only by where
                  // it sits, so it reads as inspiration in a screen reader too.
                  <span className={styles.starter}>
                    <span className={styles.starterLabel}>Quest starter (inspiration only):</span>{' '}
                    {option.questStarter}
                  </span>
                )}
              </span>
            </label>
          ))}

          <label className={styles.option}>
            <input
              type="radio"
              name={group}
              aria-label="Write your own"
              checked={selection.resolution === 'custom'}
              onChange={() => onSelect({ resolution: 'custom', text: selection.text ?? '' })}
            />
            <span className={styles.optionBody}>
              <span className={styles.optionSummary}>Write your own</span>
            </span>
          </label>
        </fieldset>

        {chosen?.subchoice !== undefined && selection.resolution === 'selected' && (
          <fieldset className={styles.options}>
            <legend className={styles.legend}>{chosen.subchoice.name}</legend>
            {chosen.subchoice.options.map((nested) => (
              <label className={styles.option} key={nested.index}>
                <input
                  type="radio"
                  name={`${group}-nested`}
                  aria-label={nested.text}
                  checked={selection.subchoiceOptionIndex === nested.index}
                  onChange={() => onSelect({ ...selection, subchoiceOptionIndex: nested.index })}
                />
                <span className={styles.optionBody}>{nested.text}</span>
              </label>
            ))}
          </fieldset>
        )}

        {selection.resolution === 'custom' && (
          <textarea
            className={styles.textarea}
            rows={3}
            aria-label={`Your answer to ${view.name}`}
            value={selection.text ?? ''}
            onChange={(event) => onSelect({ resolution: 'custom', text: event.target.value })}
          />
        )}

        {children}

        {view.blockers.length > 0 && (
          <ul className={styles.blockers}>
            {view.blockers.map((blocker) => (
              <li key={blocker.code}>{blocker.message}</li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            // Kept focusable rather than `disabled`, so a keyboard user can
            // reach it and hear why it does nothing yet.
            aria-disabled={ready === null || pending}
            onClick={() => decide(ready)}
          >
            Use this answer
          </button>
          <button
            type="button"
            className={styles.secondary}
            aria-disabled={pending}
            onClick={() => decide({ truthId: view.truthId, resolution: 'rolled' })}
          >
            Roll for it
          </button>
          <button
            type="button"
            className={styles.secondary}
            aria-disabled={pending}
            onClick={() => decide({ truthId: view.truthId, resolution: 'leave_open' })}
          >
            Leave it open
          </button>
        </div>
        <p className={styles.note}>
          Leaving a truth open is an answer: this campaign says nothing about it, and the Guide will
          not settle it later.
        </p>
      </div>
    </article>
  );
}
