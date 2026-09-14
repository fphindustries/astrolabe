import { useState } from 'react';

import { STARFORGED, type CharacterId, type MoveId } from '@astrolabe/rules';
import type { EventId } from '@astrolabe/shared';

import { useSuggestMove } from '../../api/moves.js';
import { useAiStatus } from '../../api/narration.js';
import { describeFailure } from '../narration/frames.js';

import { RelevantMovesPanel } from './RelevantMovesPanel.js';
import {
  answersCurrentText,
  confidenceLabel,
  handPickPrefill,
  suggestionHeadline,
  suggestionPrefill,
  type ComposerPrefill,
  type MoveSuggestion,
} from './suggestion.js';
import styles from './ActionPrompt.module.css';

interface Answer {
  readonly eventId: EventId;
  readonly suggestion: MoveSuggestion;
}

/**
 * The idle composer (tasks 6.1, 7.12): say what the character does, then
 * pick a move from the relevant-moves panel — or ask the Guide which one
 * fits (D-14, D-120, D-135). Asking is the only request: nothing is
 * suggested unasked (D-10).
 *
 * The panel comes first and stays usable the whole time. A move picked by hand carries the
 * typed words into the composer, and an answer that arrives after the
 * player has moved on is simply never shown. Using a suggestion fills the
 * composer; it never rolls.
 */
export function ActionPrompt({
  campaignId,
  actorCharacterId,
  onSelect,
  onOpenFullList,
}: {
  readonly campaignId: string;
  readonly actorCharacterId: CharacterId;
  readonly onSelect: (moveId: MoveId, prefill: ComposerPrefill) => void;
  readonly onOpenFullList: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const suggest = useSuggestMove(campaignId);
  const guide = useAiStatus();
  const guideUnavailable = guide.data !== undefined && !guide.data.configured;

  const ask = () => {
    setAnswer(undefined);
    setFailure(undefined);
    suggest.mutate(
      { actorCharacterId, actionText: typed.trim() },
      {
        onSuccess: (response) => {
          if (response.ok) {
            setAnswer({ eventId: response.eventId, suggestion: response.suggestion });
          } else {
            setFailure(`${describeFailure(response.errorKind)} ${response.message}`);
          }
        },
        onError: () => setFailure('The Guide could not be asked. Pick a move yourself.'),
      },
    );
  };

  const shown =
    answer !== undefined && answersCurrentText(answer.suggestion, typed) ? answer : undefined;
  const headline =
    shown === undefined ? undefined : suggestionHeadline(shown.suggestion, STARFORGED.moves);

  return (
    <div className={styles.prompt}>
      {/* The direct pick comes first and stays in view: suggestions are optional help (D-14, A3). */}
      <RelevantMovesPanel
        onSelect={(moveId) => onSelect(moveId, handPickPrefill(typed))}
        onOpenFullList={onOpenFullList}
      />
      <label className={styles.field}>
        <span className={styles.label}>What do you do?</span>
        <textarea
          className={styles.actionText}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Describe the action, then pick a move — or ask which one fits."
        />
      </label>
      <div className={styles.askRow}>
        <button
          type="button"
          className={styles.ask}
          disabled={typed.trim() === '' || suggest.isPending || guideUnavailable}
          onClick={ask}
        >
          Suggest a move
        </button>
        {suggest.isPending && (
          <span className={styles.hint}>The Guide is reading the moves… pick one any time.</span>
        )}
        {failure !== undefined && <span className={styles.failure}>{failure}</span>}
      </div>

      {shown !== undefined && (
        <div className={styles.suggestion}>
          <span className={styles.badge}>Guide</span>
          {headline === undefined ? (
            <span className={styles.body}>
              <span className={styles.headline}>No move fits.</span> {shown.suggestion.reason}
            </span>
          ) : (
            <span className={styles.body}>
              <span className={styles.headline}>{headline}</span>
              <span className={styles.confidence}>
                {confidenceLabel(shown.suggestion.confidence)}
              </span>
              <SuggestionWhy suggestion={shown.suggestion} />
              <button
                type="button"
                className={styles.use}
                onClick={() => {
                  if (shown.suggestion.moveId !== null) {
                    onSelect(
                      shown.suggestion.moveId,
                      suggestionPrefill(shown.eventId, shown.suggestion),
                    );
                  }
                }}
              >
                Use this
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** A19: the suggestion opened up — the rules words it rests on, and why. */
export function SuggestionWhy({ suggestion }: { readonly suggestion: MoveSuggestion }) {
  return (
    <details className={styles.why}>
      <summary>Why?</summary>
      {suggestion.triggerText !== undefined && (
        <blockquote className={styles.quote}>{suggestion.triggerText}</blockquote>
      )}
      <p className={styles.reason}>{suggestion.reason}</p>
      <p className={styles.reason}>{confidenceLabel(suggestion.confidence)}.</p>
    </details>
  );
}
