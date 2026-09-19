import { useRef, useState, type FormEvent } from 'react';

import { CampaignSettingsSchema, DEFAULT_CAMPAIGN_SETTINGS } from '@astrolabe/shared';
import type { CampaignSettings } from '@astrolabe/shared';

import { useCreateCampaign } from '../api/campaigns.js';
import { navigate } from '../app/location.js';
import { launchOverviewPath } from '../launch/sections.js';
import { useFocusOnArrival } from '../ui/focus.js';
import { guarded } from '../ui/guarded.js';

import styles from './NewCampaignScreen.module.css';

const NARRATION_LATITUDES = CampaignSettingsSchema.shape.narrationLatitude.options;
const NARRATION_LENGTHS = CampaignSettingsSchema.shape.narrationLength.options;

/**
 * `/campaigns/new` — a name, the narration settings, and nothing else.
 *
 * This was a four-step wizard that carried truths, the sector and the inciting
 * vow. Campaign Launch replaces all three, so what is left here is the one
 * command that creates the campaign row; everything after it belongs to the
 * workspace, which this screen opens on (D-160, golden launch beat 1).
 *
 * The premise is deliberately not here: it is the Foundation section's, where
 * it can be saved as a draft and revised before it becomes canon (D-161).
 */
export function NewCampaignScreen() {
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_CAMPAIGN_SETTINGS);

  const createCampaign = useCreateCampaign();
  const pageRef = useRef<HTMLDivElement>(null);
  useFocusOnArrival(pageRef);
  const named = name.trim().length > 0;
  const canSubmit = named && !createCampaign.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createCampaign.mutate(
      { name: name.trim(), settings },
      { onSuccess: (response) => navigate(launchOverviewPath(response.campaignId)) },
    );
  };

  return (
    <div className={styles.page} ref={pageRef}>
      <h1 className={styles.title}>New campaign</h1>
      <p className={styles.lede}>
        Naming it opens Campaign Launch, where the crew, the sector and the first vow are settled
        before play begins. Nothing here is final — every part can be revised until you launch.
      </p>
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
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Settings</h2>
          <div className={styles.settingsRow}>
            <label className={styles.setting}>
              <span className={styles.label}>Narration latitude</span>
              <select
                className={styles.select}
                value={settings.narrationLatitude}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    narrationLatitude: event.target.value as CampaignSettings['narrationLatitude'],
                  }))
                }
              >
                {NARRATION_LATITUDES.map((latitude) => (
                  <option key={latitude} value={latitude}>
                    {latitude}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.setting}>
              <span className={styles.label}>Narration length</span>
              <select
                className={styles.select}
                value={settings.narrationLength}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    narrationLength: event.target.value as CampaignSettings['narrationLength'],
                  }))
                }
              >
                {NARRATION_LENGTHS.map((length) => (
                  <option key={length} value={length}>
                    {length}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.setting}>
              <span className={styles.label}>Oracle reroll cap</span>
              <input
                type="number"
                min={0}
                className={styles.input}
                value={settings.rerollCap}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    rerollCap: Math.max(0, Number(event.target.value)),
                  }))
                }
              />
            </label>
          </div>
        </section>

        {createCampaign.isError && (
          <p className={styles.formError} role="alert">
            Couldn&rsquo;t create the campaign. Check the server and try again.
          </p>
        )}

        {!named && (
          <p className={styles.hint} id="name-required">
            Give the campaign a name to create it.
          </p>
        )}
        <button
          type="submit"
          className={styles.submit}
          {...guarded({
            busy: createCampaign.isPending,
            blocked: !named,
            reasonId: 'name-required',
          })}
        >
          Create campaign
        </button>
      </form>
    </div>
  );
}
