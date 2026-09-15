import { useState } from 'react';

import { MOVE_AUTOMATION_SPECS, STARFORGED } from '@astrolabe/rules';

import { useSuggestActions } from '../../api/moves.js';
import { useAiStatus } from '../../api/narration.js';
import type { CrewCardView } from '../crew/crew.js';
import { describeFailure } from '../narration/frames.js';

import { toSuggestedActionView, type SuggestedAction } from './what-now.js';
import styles from './WhatNow.module.css';

/**
 * "What now?" (task 9.3, A6, D-10, D-148): three suggested actions, only
 * when asked. Each names who is best placed, what they might do, the likely
 * move and why it matters now; "Why?" opens the state it builds on. Using
 * one fills the composer and never rolls. The players are free to ignore or
 * combine them, and the relevant-moves panel below stays usable throughout.
 */
export function WhatNow({
  campaignId,
  crew,
  onUse,
}: {
  readonly campaignId: string;
  readonly crew: readonly CrewCardView[];
  readonly onUse: (suggestion: SuggestedAction, playable: boolean) => void;
}) {
  const ask = useSuggestActions(campaignId);
  const guide = useAiStatus();
  const [suggestions, setSuggestions] = useState<readonly SuggestedAction[] | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const guideUnavailable = guide.data !== undefined && !guide.data.configured;

  const request = () => {
    setFailure(undefined);
    ask.mutate(undefined, {
      onSuccess: (response) => {
        if (response.ok) {
          setSuggestions(response.suggestions);
        } else {
          setFailure(`${describeFailure(response.errorKind)} ${response.message}`);
        }
      },
      onError: () => setFailure('The Guide could not be asked. Carry on without it.'),
    });
  };

  return (
    <div className={styles.whatNow}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.ask}
          disabled={ask.isPending || guideUnavailable}
          onClick={request}
        >
          {suggestions === undefined ? 'What now?' : 'Ask again'}
        </button>
        {ask.isPending && (
          <span className={styles.hint}>The Guide is looking at where things stand…</span>
        )}
        {suggestions !== undefined && !ask.isPending && (
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => setSuggestions(undefined)}
          >
            Dismiss
          </button>
        )}
        {failure !== undefined && <span className={styles.failure}>{failure}</span>}
      </div>
      {suggestions !== undefined && (
        <ul className={styles.list}>
          {suggestions.map((suggestion, i) => {
            const view = toSuggestedActionView(
              suggestion,
              crew,
              STARFORGED.moves,
              MOVE_AUTOMATION_SPECS,
            );
            return (
              <li key={i} className={styles.card}>
                <span className={styles.badge}>Guide</span>
                <span className={styles.body}>
                  <span className={styles.action}>{view.actionText}</span>
                  <span className={styles.meta}>
                    {view.callsign}
                    {view.moveName !== undefined ? ` · ${view.moveName}` : ' · no move'}
                    {view.moveName !== undefined && !view.playable ? ' (rules reference)' : ''}
                  </span>
                  <span className={styles.reason}>{view.reason}</span>
                  <details className={styles.why}>
                    <summary>Why?</summary>
                    <ul className={styles.anchors}>
                      {view.anchors.map((anchor) => (
                        <li key={anchor}>{anchor}</li>
                      ))}
                    </ul>
                  </details>
                  <button
                    type="button"
                    className={styles.use}
                    onClick={() => onUse(suggestion, view.playable)}
                  >
                    Use this
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
