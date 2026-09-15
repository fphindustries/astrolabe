import { useState } from 'react';

import type { MoveChoiceView } from '@astrolabe/shared';

import { useApplyMoveChoice } from '../../api/moves.js';

import styles from './ChoicePrompt.module.css';

/**
 * Task 6.6: a `Choice` the resolved outcome offered. `available` was
 * already evaluated server-side (`evaluateCondition`, against the acting
 * character's current state) — this only renders what came back, it never
 * re-derives availability itself.
 */
export function ChoicePrompt({
  campaignId,
  choice,
  onApplied,
}: {
  readonly campaignId: string;
  readonly choice: MoveChoiceView;
  readonly onApplied: () => void;
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [declined, setDeclined] = useState(false);
  const applyChoice = useApplyMoveChoice(campaignId);
  const multi = choice.pick.max > 1;

  const canSubmit =
    (declined && choice.optional) ||
    (selected.length >= choice.pick.min && selected.length <= choice.pick.max);

  function toggle(id: string) {
    setDeclined(false);
    setSelected((current) => {
      if (current.includes(id)) {
        return current.filter((o) => o !== id);
      }
      return multi ? [...current, id] : [id];
    });
  }

  async function submit() {
    await applyChoice.mutateAsync({
      rollEventId: choice.rollEventId,
      choiceId: choice.choiceId,
      optionIds: declined ? [] : selected,
    });
    onApplied();
  }

  // 10.3: a keyboard player lands on the first option they can pick.
  const firstAvailable = choice.options.find((option) => option.available)?.id;

  return (
    <div className={styles.prompt}>
      <p className={styles.question}>{choice.prompt}</p>
      <div className={styles.options}>
        {choice.options.map((option) => (
          <label key={option.id} className={styles.option} data-unavailable={!option.available}>
            <input
              {...(option.id === firstAvailable ? { 'data-focus-target': true } : {})}
              type={multi ? 'checkbox' : 'radio'}
              name="choice-option"
              disabled={!option.available || applyChoice.isPending}
              checked={selected.includes(option.id)}
              onChange={() => toggle(option.id)}
            />
            {option.label}
            {!option.available && <span className={styles.unavailableNote}> (not available)</span>}
          </label>
        ))}
        {choice.optional && (
          <label className={styles.option}>
            <input
              type="radio"
              name="choice-option"
              disabled={applyChoice.isPending}
              checked={declined}
              onChange={() => {
                setDeclined(true);
                setSelected([]);
              }}
            />
            None of these
          </label>
        )}
      </div>
      <button
        type="button"
        className={styles.confirm}
        disabled={!canSubmit || applyChoice.isPending}
        onClick={() => void submit()}
      >
        {applyChoice.isPending ? 'Applying…' : 'Confirm'}
      </button>
    </div>
  );
}
