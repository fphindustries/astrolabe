import { useState } from 'react';

import { CHALLENGE_RANKS, type ChallengeRank, type CharacterId } from '@astrolabe/rules';
import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useAcceptIncident } from '../api/incident.js';
import { fieldAnchorId } from '../ui/error-summary.js';
import { guarded } from '../ui/guarded.js';

import {
  initialVowChoices,
  sceneLocationName,
  setRoller,
  setSceneTitle,
  setSharing,
  setVowRank,
  toVowChoicesRequest,
  vowChoicesChanged,
  type VowChoices,
} from './vow-choices.js';
import styles from './SectorSection.module.css';

/**
 * The inciting vow's choices (9.3, beat 12, D-200): who swears it, who shares
 * it, its rank, and the opening scene's title. Saved as a revision of the
 * accepted incident. Where the scene opens is the starting settlement.
 */
export function VowChoicesPanel({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const state = workspace.state;
  const [choices, setChoices] = useState<VowChoices | undefined>(() => initialVowChoices(state));
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const accept = useAcceptIncident(campaignId);
  if (choices === undefined) return null;
  const crew = Object.values(state.characters);
  const request = toVowChoicesRequest(choices);
  const changed = vowChoicesChanged(state, choices);
  const where = sceneLocationName(state);
  const edit = (next: VowChoices) => {
    setSaved(undefined);
    setChoices(next);
  };

  return (
    <section className={styles.block} aria-labelledby="vow-choices-heading">
      <h3 className={styles.blockHeading} id="vow-choices-heading">
        The inciting vow
      </h3>
      <p className={styles.intro}>
        Session 1 opens with this vow sworn by Swear an Iron Vow, a real roll. Choose who swears it,
        who shares it, its rank, and the opening scene.
      </p>
      {accept.error !== null && (
        <p className={styles.unavailable} role="alert">
          {accept.error.message}
        </p>
      )}

      <fieldset className={styles.group}>
        <legend className={styles.label}>Sworn by</legend>
        {crew.map((character) => (
          <label key={character.id} className={styles.choice}>
            <input
              type="radio"
              name="vow-roller"
              checked={choices.rollerId === character.id}
              onChange={() => edit(setRoller(choices, character.id as CharacterId))}
            />
            <span>{character.name}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.label}>Shared by</legend>
        <p className={styles.help}>The one who swears it always shares it.</p>
        {crew.map((character) => (
          <label key={character.id} className={styles.choice}>
            <input
              type="checkbox"
              checked={choices.participants.includes(character.id as CharacterId)}
              disabled={character.id === choices.rollerId}
              onChange={(event) =>
                edit(setSharing(choices, character.id as CharacterId, event.target.checked))
              }
            />
            <span>{character.name}</span>
          </label>
        ))}
      </fieldset>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldAnchorId('incident.vow.rank')}>
          Rank
        </label>
        <select
          id={fieldAnchorId('incident.vow.rank')}
          className={styles.input}
          value={choices.rank}
          onChange={(event) => edit(setVowRank(choices, event.target.value as ChallengeRank))}
        >
          {CHALLENGE_RANKS.map((rank) => (
            <option key={rank} value={rank}>
              {rank}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldAnchorId('incident.vow')}>
          Opening scene
        </label>
        <p className={styles.help}>
          {where === undefined
            ? 'It opens at the starting settlement, once one is chosen.'
            : `It opens at ${where}, the starting settlement.`}
        </p>
        <input
          id={fieldAnchorId('incident.vow')}
          className={styles.input}
          value={choices.sceneTitle}
          onChange={(event) => edit(setSceneTitle(choices, event.target.value))}
        />
      </div>

      {saved !== undefined && (
        <p className={styles.saved} role="status">
          {saved}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          {...guarded({
            busy: accept.isPending,
            blocked: request === null || !changed,
            onClick: () => {
              if (request === null) return;
              accept.mutate(request, { onSuccess: () => setSaved('Saved with the incident.') });
            },
          })}
        >
          Save the vow’s choices
        </button>
      </div>
      {request === null && (
        <p className={styles.note}>Choose who swears it and title the opening scene.</p>
      )}
    </section>
  );
}
