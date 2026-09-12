import { useState, type FormEvent } from 'react';

import {
  STARFORGED,
  STAT_IDS,
  grantedAssets,
  validateCharacterDraft,
  type AssetId,
  type CharacterDraft,
} from '@astrolabe/rules';
import { ChallengeRankSchema, type ChallengeRank } from '@astrolabe/shared';

import { useCreateCharacter } from '../api/characters.js';
import { ApiError } from '../api/http.js';
import { navigate } from '../app/location.js';

import {
  CREATION_SLOTS,
  assignStat,
  emptyDraft,
  grantedAssetViews,
  problemsByField,
} from './creation-form.js';
import { AssetPicker } from './AssetPicker.js';
import styles from './CharacterCreationScreen.module.css';

const GRANTED = grantedAssetViews(STARFORGED, grantedAssets(STARFORGED));

/**
 * `/campaigns/:id/characters/new` (task 3.2, D-100 — a full page, not a
 * drawer). Manual creation: every field is directly editable and validated
 * against `validateCharacterDraft` as it changes (D-90) — this screen never
 * recounts slots or stats itself. Concept-first (3.3) will populate the same
 * fields from an AI proposal rather than replacing this form.
 *
 * No `grantCommandVehicle` toggle: section 3's notes reserve that for 3.3,
 * if the concept-first flow ever wants a "no ship of your own" option.
 * Manual creation always grants the starship.
 */
export function CharacterCreationScreen({ campaignId }: { readonly campaignId: string }) {
  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [stats, setStats] = useState(emptyDraft().stats);
  const [slotSelections, setSlotSelections] = useState<Partial<Record<string, AssetId>>>({});
  const [swearVow, setSwearVow] = useState(false);
  const [vowTitle, setVowTitle] = useState('');
  const [vowRank, setVowRank] = useState<ChallengeRank>('troublesome');

  const createCharacter = useCreateCharacter(campaignId);

  const draft: CharacterDraft = {
    name,
    callsign,
    stats,
    assets: CREATION_SLOTS.map((slot) => slotSelections[slot.id]).filter(
      (assetId): assetId is AssetId => assetId !== undefined,
    ),
  };
  const problems = validateCharacterDraft(draft, STARFORGED);
  const fieldProblems = problemsByField(problems);
  const canSubmit = problems.length === 0 && !createCharacter.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createCharacter.mutate(
      {
        draft,
        ...(swearVow ? { backgroundVow: { title: vowTitle, rank: vowRank } } : {}),
      },
      { onSuccess: () => navigate(`/campaigns/${campaignId}`) },
    );
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>New character</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <label className={styles.label} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldErrors messages={fieldProblems.name} />

          <label className={styles.label} htmlFor="callsign">
            Callsign
          </label>
          <input
            id="callsign"
            className={styles.input}
            value={callsign}
            onChange={(event) => setCallsign(event.target.value)}
          />
          <FieldErrors messages={fieldProblems.callsign} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Stats</h2>
          <div className={styles.statRow}>
            {STAT_IDS.map((statId) => (
              <label key={statId} className={styles.stat}>
                <span className={styles.statLabel}>{statId}</span>
                <select
                  className={styles.select}
                  value={stats[statId]}
                  onChange={(event) =>
                    setStats(assignStat(stats, statId, Number(event.target.value)))
                  }
                >
                  {[1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <FieldErrors messages={fieldProblems.stats} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Assets</h2>
          {CREATION_SLOTS.map((slot) => (
            <AssetPicker
              key={slot.id}
              slot={slot}
              ruleset={STARFORGED}
              selected={slotSelections[slot.id]}
              onChange={(assetId) =>
                setSlotSelections((current) => ({ ...current, [slot.id]: assetId }))
              }
            />
          ))}
          <div className={styles.granted}>
            <span className={styles.label}>Granted</span>
            <ul className={styles.grantedList}>
              {GRANTED.map((asset) => (
                <li key={asset.id}>{asset.name}</li>
              ))}
            </ul>
          </div>
          <FieldErrors messages={fieldProblems.assets} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Background vow</h2>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={swearVow}
              onChange={(event) => setSwearVow(event.target.checked)}
            />
            Swear a background vow now
          </label>
          {swearVow && (
            <div className={styles.vowFields}>
              <input
                className={styles.input}
                placeholder="Vow title"
                value={vowTitle}
                onChange={(event) => setVowTitle(event.target.value)}
              />
              <select
                className={styles.select}
                value={vowRank}
                onChange={(event) => setVowRank(event.target.value as ChallengeRank)}
              >
                {ChallengeRankSchema.options.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {createCharacter.isError && (
          <p className={styles.formError}>{describeError(createCharacter.error)}</p>
        )}

        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          Create character
        </button>
      </form>
    </div>
  );
}

function FieldErrors({ messages }: { readonly messages: readonly string[] | undefined }) {
  if (messages === undefined || messages.length === 0) {
    return null;
  }
  return (
    <ul className={styles.errors}>
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) {
    return 'The server rejected this draft — reload and try again.';
  }
  return "Couldn't create the character. Check the server and try again.";
}
