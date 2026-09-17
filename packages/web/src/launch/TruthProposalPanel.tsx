import { useState } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useProposeTruth } from '../api/launch.js';

import type { DecideTruthBody, TruthSelection } from './truth-form.js';
import { toDecideRequest } from './truth-form.js';
import { heldProposal, isEditedProposal, proposalSelection } from './truth-proposal.js';
import type { TruthView } from './truths.js';
import styles from './TruthProposalPanel.module.css';

/**
 * Ask the Guide about one truth (5.3, A42, D-161, D-166).
 *
 * What comes back is a recommendation, not an answer. It sits here with its
 * reason until the player accepts it, edits it, asks again, or ignores it —
 * and accepting is the ordinary decide command the manual paths use, with the
 * proposal named so the server can record whose answer it is.
 *
 * **With no provider configured, only these controls stop working.** The
 * message says so in as many words, and choosing, rolling, writing and leaving
 * open are untouched: that is A42, and it is why the Guide is an accelerator
 * here rather than a dependency (D-166).
 */
export function TruthProposalPanel({
  campaignId,
  view,
  workspace,
  selection,
  onSelect,
  onDecide,
}: {
  readonly campaignId: string;
  readonly view: TruthView;
  readonly workspace: LaunchWorkspaceResponse;
  readonly selection: TruthSelection;
  readonly onSelect: (selection: TruthSelection) => void;
  readonly onDecide: (body: DecideTruthBody) => void;
}) {
  const propose = useProposeTruth(campaignId);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  const held = heldProposal(workspace.state, view.truthId);
  const option = held?.optionIndex === undefined ? undefined : view.options[held.optionIndex];
  const edited = held !== null && isEditedProposal(held, selection);

  const ask = () => {
    setRefusal(undefined);
    propose.mutate(view.truthId, {
      onSuccess: (result) => {
        // A42: a provider that is missing or unavailable is an outcome the
        // panel renders, not an error that takes the page down.
        if (!result.ok) setRefusal(result.message);
      },
      onError: () => setRefusal('The Guide could not be reached.'),
    });
  };

  // The same call the card's own button makes. There is one accept path and
  // one provenance: the selection carries the proposal's id from the moment
  // the player takes it, so pressing the more prominent button cannot record
  // the Guide's answer as the player's own.
  const accept = () => {
    const body = toDecideRequest(view.truthId, selection);
    if (body !== null) onDecide(body);
  };

  return (
    <section className={styles.panel} aria-label={`The Guide on ${view.name}`}>
      <div className={styles.head}>
        <h4 className={styles.heading}>Ask the Guide</h4>
        <button
          type="button"
          className={styles.secondary}
          aria-disabled={propose.isPending}
          onClick={ask}
        >
          {held === null ? 'Ask the Guide' : 'Ask again'}
        </button>
      </div>

      {refusal !== undefined && (
        <p className={styles.refusal} role="status">
          {refusal} Choosing, rolling, writing and leaving this truth open all still work.
        </p>
      )}

      {held !== null && (
        <div className={styles.proposal}>
          <p className={styles.badges}>
            <span className={styles.badge}>Guide</span>
            <span className={styles.notCanon}>Not canon until you accept it</span>
          </p>
          <p className={styles.recommendation}>
            {held.resolution === 'selected'
              ? (option?.summary ?? `Option ${String((held.optionIndex ?? 0) + 1)}`)
              : held.text}
          </p>
          <p className={styles.rationale}>{held.rationale}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => onSelect(proposalSelection(held))}
            >
              Use this
            </button>
            <button
              type="button"
              className={styles.primary}
              aria-disabled={toDecideRequest(view.truthId, selection) === null}
              onClick={accept}
            >
              {edited ? 'Accept your edit of it' : 'Accept the Guide’s answer'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
