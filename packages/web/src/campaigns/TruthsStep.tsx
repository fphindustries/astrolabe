import { useState } from 'react';

import { STARFORGED, withoutLinks, type OracleTable } from '@astrolabe/rules';

import { useCampaignState } from '../api/campaigns.js';
import { useSetTruth } from '../api/campaign-setup.js';

import { unansweredTruths } from './campaign-setup.js';
import styles from './TruthsStep.module.css';

/**
 * Truths (task 4.2, D-31): pick, roll, or write, per question. Answered
 * questions drop off the list — `useCampaignState` is refetched after each
 * answer (`useSetTruth`'s `onSuccess`), so this never tracks "answered"
 * itself. The player can move on before every question is answered; this
 * screen only tracks progress, it doesn't gate on completeness.
 */
export function TruthsStep({
  campaignId,
  onNext,
}: {
  readonly campaignId: string;
  readonly onNext: () => void;
}) {
  const { data: state } = useCampaignState(campaignId);
  const answered = state?.truths ?? {};
  const remaining = unansweredTruths(STARFORGED.truths, answered);

  return (
    <div className={styles.list}>
      <p className={styles.progress}>
        {STARFORGED.truths.length - remaining.length} of {STARFORGED.truths.length} answered
      </p>
      {remaining.map((truth) => (
        <TruthQuestion key={truth.id} campaignId={campaignId} truth={truth} />
      ))}
      <button type="button" className={styles.next} onClick={onNext}>
        Next: the sector
      </button>
    </div>
  );
}

type Mode = 'picked' | 'rolled' | 'written';

function TruthQuestion({
  campaignId,
  truth,
}: {
  readonly campaignId: string;
  readonly truth: OracleTable;
}) {
  const [mode, setMode] = useState<Mode | undefined>(undefined);
  const [rowIndex, setRowIndex] = useState(0);
  const [text, setText] = useState('');
  const setTruth = useSetTruth(campaignId);

  const submit = () => {
    if (mode === 'written') {
      if (text.trim().length === 0) return;
      setTruth.mutate({ oracleId: truth.id, source: 'written', text });
    } else if (mode === 'picked') {
      setTruth.mutate({ oracleId: truth.id, source: 'picked', rowIndex });
    } else if (mode === 'rolled') {
      setTruth.mutate({ oracleId: truth.id, source: 'rolled' });
    }
  };

  return (
    <div className={styles.question}>
      <span className={styles.name}>{truth.name}</span>
      {mode === undefined && (
        <div className={styles.controls}>
          <button type="button" className={styles.button} onClick={() => setMode('picked')}>
            Pick
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => setTruth.mutate({ oracleId: truth.id, source: 'rolled' })}
          >
            Roll
          </button>
          <button type="button" className={styles.button} onClick={() => setMode('written')}>
            Write my own
          </button>
        </div>
      )}
      {mode === 'picked' && (
        <div className={styles.controls}>
          <select
            className={styles.select}
            value={rowIndex}
            onChange={(event) => setRowIndex(Number(event.target.value))}
          >
            {truth.rows.map((row, index) => (
              <option key={index} value={index}>
                {withoutLinks(row.text).slice(0, 80)}
                {withoutLinks(row.text).length > 80 ? '…' : ''}
              </option>
            ))}
          </select>
          <button type="button" className={styles.button} onClick={submit}>
            Choose
          </button>
        </div>
      )}
      {mode === 'written' && (
        <div className={styles.controls}>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="button" className={styles.button} onClick={submit}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}
