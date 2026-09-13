import { useState, type FormEvent } from 'react';

import { ChallengeRankSchema, type ChallengeRank } from '@astrolabe/shared';

import { useSwearIncitingVow } from '../api/campaign-setup.js';
import { navigate } from '../app/location.js';

import styles from './IncitingIncidentStep.module.css';

/**
 * The inciting incident becomes the first vow (task 4.4, D-34, D-101).
 * Only the player-written path exists for now — the AI-proposal half of
 * D-34 waits on the AI provider (group 7), the same deferral 3.3 already
 * gets. Finishing this step ends campaign setup and hands off to the play
 * screen, which is the campaign's home (D-100).
 */
export function IncitingIncidentStep({ campaignId }: { readonly campaignId: string }) {
  const [title, setTitle] = useState('');
  const [rank, setRank] = useState<ChallengeRank>('formidable');
  const swearVow = useSwearIncitingVow(campaignId);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length === 0) return;
    swearVow.mutate({ title, rank }, { onSuccess: () => navigate(`/campaigns/${campaignId}`) });
  };

  return (
    <form className={styles.section} onSubmit={handleSubmit}>
      <textarea
        className={styles.textarea}
        placeholder="What set this crew on their way?"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <select
        className={styles.select}
        value={rank}
        onChange={(event) => setRank(event.target.value as ChallengeRank)}
      >
        {ChallengeRankSchema.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className={styles.submit}
        disabled={title.trim().length === 0 || swearVow.isPending}
      >
        Swear this vow and start playing
      </button>
    </form>
  );
}
