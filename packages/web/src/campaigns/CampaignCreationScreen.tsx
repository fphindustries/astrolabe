import { useState, type FormEvent } from 'react';

import { CampaignSettingsSchema, DEFAULT_CAMPAIGN_SETTINGS } from '@astrolabe/shared';
import type { CampaignSettings } from '@astrolabe/shared';

import { useCreateCampaign } from '../api/campaigns.js';

import { IncitingIncidentStep } from './IncitingIncidentStep.js';
import { SectorStep } from './SectorStep.js';
import { TruthsStep } from './TruthsStep.js';
import styles from './CampaignCreationScreen.module.css';

const NARRATION_LATITUDES = CampaignSettingsSchema.shape.narrationLatitude.options;
const NARRATION_LENGTHS = CampaignSettingsSchema.shape.narrationLength.options;

type Step = 'settings' | 'truths' | 'sector' | 'incident';

/**
 * `/campaigns/new` (task 4.1, D-100 — a full page, not a drawer). A
 * four-step wizard covering the whole shared setup evening (design record
 * §6): campaign + settings (4.1, 4.5), truths (4.2), the sector (4.3), and
 * the inciting incident that becomes the first vow (4.4). Steps are kept as
 * component state here rather than routes — the campaign this screen
 * creates in step one is what every later step writes against, and there's
 * nothing else that needs a URL of its own.
 */
export function CampaignCreationScreen() {
  const [step, setStep] = useState<Step>('settings');
  const [campaignId, setCampaignId] = useState<string | undefined>(undefined);

  if (step !== 'settings' && campaignId !== undefined) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>New campaign</h1>
        {step === 'truths' && (
          <TruthsStep campaignId={campaignId} onNext={() => setStep('sector')} />
        )}
        {step === 'sector' && (
          <SectorStep campaignId={campaignId} onNext={() => setStep('incident')} />
        )}
        {step === 'incident' && <IncitingIncidentStep campaignId={campaignId} />}
      </div>
    );
  }

  return (
    <SettingsStep
      onCreated={(id) => {
        setCampaignId(id);
        setStep('truths');
      }}
    />
  );
}

function SettingsStep({ onCreated }: { readonly onCreated: (campaignId: string) => void }) {
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_CAMPAIGN_SETTINGS);

  const createCampaign = useCreateCampaign();

  const canSubmit = name.trim().length > 0 && !createCampaign.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createCampaign.mutate(
      { name, settings },
      { onSuccess: (response) => onCreated(response.campaignId) },
    );
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>New campaign</h1>
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
          <p className={styles.formError}>
            Couldn&rsquo;t create the campaign. Check the server and try again.
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          Create campaign
        </button>
      </form>
    </div>
  );
}
