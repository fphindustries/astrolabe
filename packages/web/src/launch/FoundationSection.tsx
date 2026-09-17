import { useState, type FormEvent } from 'react';

import { CampaignSettingsSchema } from '@astrolabe/shared';
import type { CampaignSettings, LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useSaveLaunchDraft, useSetFoundation } from '../api/launch.js';
import { navigate } from '../app/location.js';
import { ErrorSummary } from '../ui/ErrorSummary.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { launchErrorSummary } from './errors.js';
import { initialFoundationForm, toDraftSnapshot, toFoundationRequest } from './foundation-form.js';
import { launchOverviewPath } from './sections.js';
import styles from './FoundationSection.module.css';

const LATITUDES = CampaignSettingsSchema.shape.narrationLatitude.options;
const LENGTHS = CampaignSettingsSchema.shape.narrationLength.options;
const PREMISE_ID = fieldAnchorId('premise');
const PREMISE_HELP_ID = `${PREMISE_ID}-help`;

/**
 * Foundation: the campaign's premise and how the Guide narrates (beat 1).
 *
 * The two buttons are D-161 made visible, and the page says which is which.
 * **Save and continue** appends a draft snapshot — durable, so leaving and
 * reopening loses nothing, and not canon, so it does not clear the section's
 * blocker. **Set as campaign foundation** writes the accepted fact.
 */
export function FoundationSection({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const [form, setForm] = useState(() => initialFoundationForm(workspace.state));
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);

  const saveDraft = useSaveLaunchDraft(campaignId);
  const setFoundation = useSetFoundation(campaignId);
  const failure = setFoundation.error ?? saveDraft.error;
  const premiseMissing = toFoundationRequest(form) === null;

  const setSettings = (change: Partial<CampaignSettings>) =>
    setForm((current) => ({ ...current, settings: { ...current.settings, ...change } }));

  const handleSaveDraft = () => {
    setSubmitted(false);
    saveDraft.mutate(
      { section: 'foundation', snapshot: toDraftSnapshot(form) },
      { onSuccess: () => setSaved('Saved as setup. This is not campaign canon yet.') },
    );
  };

  const handleAccept = (event: FormEvent) => {
    event.preventDefault();
    const request = toFoundationRequest(form);
    if (request === null) {
      // The server would refuse this with `premise_required` (D-181). Saying so
      // here keeps the reason in the summary rather than in a 422.
      setSubmitted(true);
      return;
    }
    setSubmitted(false);
    setFoundation.mutate(request, { onSuccess: () => navigate(launchOverviewPath(campaignId)) });
  };

  return (
    <form className={styles.form} onSubmit={handleAccept}>
      {submitted && premiseMissing && (
        <ErrorSummary
          takeFocus
          title="This section needs one more thing before it can be accepted."
          problems={[{ path: 'premise', message: 'A campaign needs a premise.' }]}
        />
      )}
      {failure !== null && failure !== undefined && (
        <ErrorSummary takeFocus {...launchErrorSummary(failure)} />
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={PREMISE_ID}>
          Premise
        </label>
        <p className={styles.help} id={PREMISE_HELP_ID}>
          A sentence or two on what this campaign is about. The Guide uses it as context; you can
          revise it at any time before launch.
        </p>
        <textarea
          id={PREMISE_ID}
          className={styles.textarea}
          rows={4}
          value={form.premise}
          aria-describedby={PREMISE_HELP_ID}
          aria-invalid={submitted && premiseMissing ? true : undefined}
          onChange={(event) => {
            setSaved(undefined);
            setForm((current) => ({ ...current, premise: event.target.value }));
          }}
        />
      </div>

      <fieldset className={styles.settings}>
        <legend className={styles.label}>Narration</legend>
        <label className={styles.setting}>
          <span className={styles.settingLabel}>Latitude</span>
          <select
            className={styles.select}
            value={form.settings.narrationLatitude}
            onChange={(event) =>
              setSettings({
                narrationLatitude: event.target.value as CampaignSettings['narrationLatitude'],
              })
            }
          >
            {LATITUDES.map((latitude) => (
              <option key={latitude} value={latitude}>
                {latitude}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.setting}>
          <span className={styles.settingLabel}>Length</span>
          <select
            className={styles.select}
            value={form.settings.narrationLength}
            onChange={(event) =>
              setSettings({
                narrationLength: event.target.value as CampaignSettings['narrationLength'],
              })
            }
          >
            {LENGTHS.map((length) => (
              <option key={length} value={length}>
                {length}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.setting}>
          <span className={styles.settingLabel}>Oracle reroll cap</span>
          <input
            type="number"
            min={0}
            className={styles.number}
            value={form.settings.rerollCap}
            onChange={(event) =>
              setSettings({ rerollCap: Math.max(0, Number(event.target.value)) })
            }
          />
        </label>
      </fieldset>

      {saved !== undefined && (
        <p className={styles.saved} role="status">
          {saved}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={saveDraft.isPending}
          onClick={handleSaveDraft}
        >
          Save and continue
        </button>
        <button type="submit" className={styles.primary} disabled={setFoundation.isPending}>
          Set as campaign foundation
        </button>
      </div>
      <p className={styles.note}>
        Saving keeps your work without making it a campaign fact. Setting the foundation is what
        completes this section.
      </p>
    </form>
  );
}
