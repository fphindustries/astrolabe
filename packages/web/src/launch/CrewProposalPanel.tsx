import { useState } from 'react';

import type { OracleChip } from '@astrolabe/shared';

import { describeFailure } from '../play/narration/frames.js';
import { guarded } from '../ui/guarded.js';

import {
  CREW_PROPOSAL_FIELDS,
  PROPOSAL_FIELD_LABELS,
  proposalGrounding,
  proposalReason,
  proposedFields,
  type CrewProposal,
  type CrewProposalField,
} from './crew-form.js';
import { rollChipText } from './roll-chip.js';
import styles from './CrewProposalPanel.module.css';

/**
 * Asking the Guide for a crew member, and reviewing what comes back (6.3,
 * D-166, beats 3 and 5).
 *
 * The Guide proposes; the player decides. Nothing here writes anything — the
 * proposal is held beside the form until the player takes the fields they want,
 * and only accepting the character makes any of it canon (D-161).
 *
 * Beat 3 takes the whole proposal and then edits one field. Beat 5 asks for
 * help with two fields and keeps the rest of its own. Both are the same
 * control: choose which fields to take.
 */
export function CrewProposalPanel({
  concept,
  onConcept,
  proposal,
  chips,
  applied,
  edited,
  failure,
  pending,
  aiAvailable,
  aiReason,
  onAsk,
  onApply,
  onRestore,
  onDismiss,
}: {
  readonly concept: string;
  readonly onConcept: (concept: string) => void;
  readonly proposal: CrewProposal | undefined;
  readonly chips: Readonly<Record<string, OracleChip>>;
  readonly applied: readonly CrewProposalField[];
  readonly edited: readonly CrewProposalField[];
  readonly failure: string | undefined;
  readonly pending: boolean;
  readonly aiAvailable: boolean;
  readonly aiReason: string | undefined;
  readonly onAsk: (fields: readonly CrewProposalField[] | undefined) => void;
  readonly onApply: (fields: readonly CrewProposalField[]) => void;
  readonly onRestore: (field: CrewProposalField) => void;
  readonly onDismiss: () => void;
}) {
  const [wanted, setWanted] = useState<ReadonlySet<CrewProposalField>>(new Set());
  const offered = proposal === undefined ? [] : proposedFields(proposal);

  return (
    <section className={styles.panel} aria-labelledby="crew-guide-heading">
      <h4 className={styles.heading} id="crew-guide-heading">
        Ask the Guide
      </h4>
      <p className={styles.help}>
        Describe the character you want. The Guide proposes a complete build from your words and the
        server’s own rolls; you keep what you like and change the rest. Nothing is written until you
        accept the character.
      </p>

      <label className={styles.label} htmlFor="crew-concept">
        Concept
      </label>
      <textarea
        id="crew-concept"
        className={styles.textarea}
        rows={3}
        value={concept}
        onChange={(event) => onConcept(event.target.value)}
      />

      <fieldset className={styles.fields}>
        <legend className={styles.label}>Help with</legend>
        <p className={styles.help}>
          Leave these unticked for a whole character. Tick a few and the Guide’s answer is applied
          only to those — the rest stays exactly as you wrote it.
        </p>
        {CREW_PROPOSAL_FIELDS.map((field) => (
          <label key={field} className={styles.choice}>
            <input
              type="checkbox"
              checked={wanted.has(field)}
              onChange={(event) => {
                const next = new Set(wanted);
                if (event.target.checked) next.add(field);
                else next.delete(field);
                setWanted(next);
              }}
            />
            <span>{PROPOSAL_FIELD_LABELS[field]}</span>
          </label>
        ))}
      </fieldset>

      {!aiAvailable && (
        <p className={styles.unavailable} role="status" id="crew-guide-unavailable">
          {aiReason ?? 'No Guide is configured.'} Every other way of building this character still
          works — write the fields, or roll for a backstory prompt.
        </p>
      )}
      {failure !== undefined && (
        <p className={styles.unavailable} role="status">
          {failure} The rolls the server made are still yours; nothing else changed.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          {...guarded({
            busy: pending,
            blocked: !aiAvailable || concept.trim() === '',
            reasonId: 'crew-guide-unavailable',
            onClick: () => onAsk(wanted.size === 0 ? undefined : [...wanted]),
          })}
        >
          {pending ? 'Asking…' : 'Ask the Guide'}
        </button>
      </div>

      {proposal !== undefined && (
        <div className={styles.review}>
          <h5 className={styles.heading}>What the Guide proposed</h5>
          <dl className={styles.proposed}>
            {offered.map((field) => {
              const grounding = proposalGrounding(proposal, field);
              return (
                <div key={field} className={styles.row}>
                  <dt className={styles.rowLabel}>
                    {PROPOSAL_FIELD_LABELS[field]}
                    {edited.includes(field) && (
                      <span className={styles.edited}>you changed this</span>
                    )}
                  </dt>
                  <dd className={styles.rowValue}>
                    <p className={styles.reason}>{proposalReason(proposal, field)}</p>
                    {grounding.length > 0 && (
                      <ul className={styles.chips}>
                        {grounding.map((eventId) => {
                          const chip = chips[eventId];
                          return chip === undefined ? null : (
                            <li key={eventId} className={styles.chip}>
                              {rollChipText(chip)}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {edited.includes(field) && (
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => onRestore(field)}
                      >
                        Restore the Guide’s answer
                      </button>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => onApply(offered)}>
              Take the whole proposal
            </button>
            {applied.length > 0 && (
              <span className={styles.note}>
                {applied.length} of {offered.length} fields taken. Edit any of them below; the
                Guide’s original stays here.
              </span>
            )}
            <button type="button" className={styles.secondary} onClick={onDismiss}>
              Discard it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** An AI failure in the words the rest of the app already uses for one. */
export function proposalFailureText(response: { readonly errorKind: string }): string {
  return describeFailure(response.errorKind as never);
}
