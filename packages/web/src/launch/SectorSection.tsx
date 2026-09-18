import { useRef, useState } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useSaveLaunchDraft } from '../api/launch.js';
import { useConfigureSector, useRollLaunchRecipe } from '../api/sector.js';
import { ErrorSummary } from '../ui/ErrorSummary.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { launchErrorSummary } from './errors.js';
import { SectorPlaces } from './SectorPlaces.js';
import {
  REGIONS,
  REGION_DESCRIPTIONS,
  REGION_LABELS,
  applyNameRoll,
  baselineOf,
  headerProblems,
  initialSectorForm,
  isHeaderDirty,
  sectorBlockers,
  setName,
  setRegion,
  toConfigureRequest,
  toDraftSnapshot,
  type SectorForm,
} from './sector-form.js';
import styles from './SectorSection.module.css';

/** A field's DOM id, from the same path the server's blockers use. */
const anchor = (path: string) => fieldAnchorId(path);

/**
 * The starting sector (group 8, beats 7–9, D-165).
 *
 * One form for the whole section, because one draft holds it (8.0i). **Save
 * and continue** keeps the work without making it canon; each object is
 * accepted on its own, and the server's blockers say what still stands
 * between this section and complete (D-176).
 */
export function SectorSection({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const [baseline, setBaseline] = useState(() => initialSectorForm(workspace.state));
  const [form, setForm] = useState<SectorForm>(baseline);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<string | undefined>(undefined);

  const saveDraft = useSaveLaunchDraft<'sector'>(campaignId);
  const configure = useConfigureSector(campaignId);
  const failure = configure.error ?? saveDraft.error;

  // The latest form, so a transition applied after the server answers is
  // applied to what the screen shows now, and what is saved is that result.
  const latest = useRef(form);
  latest.current = form;
  const update = (change: (current: SectorForm) => SectorForm): SectorForm => {
    const next = change(latest.current);
    latest.current = next;
    // Any change makes an earlier "Saved" untrue, wherever on the page it was made.
    setSaved(undefined);
    setForm(next);
    return next;
  };
  const edit = (next: SectorForm) => update(() => next);
  // After an acceptance the draft is saved as the form now stands, so the
  // accepted object's new id is in it and a reload shows it once (8.2).
  const persist = (next: SectorForm) =>
    saveDraft.mutate({ section: 'sector', snapshot: toDraftSnapshot(next) });

  const handleSaveDraft = () => {
    saveDraft.mutate(
      { section: 'sector', snapshot: toDraftSnapshot(form) },
      { onSuccess: () => setSaved('Saved as setup. This is not campaign canon yet.') },
    );
  };

  const configured = workspace.state.launch.sector !== undefined;
  const handleConfigure = () => {
    const request = toConfigureRequest(form);
    if (request === null) {
      setSubmitted(true);
      return;
    }
    setSubmitted(false);
    configure.mutate(request, {
      onSuccess: () => {
        setBaseline(form);
        setSaved(
          configured
            ? 'Saved. The earlier version stays in the sector’s history.'
            : 'Accepted. This is the crew’s starting sector.',
        );
      },
    });
  };

  const problems = headerProblems(form);
  const blockers = sectorBlockers(workspace.readiness);

  return (
    <div className={styles.section}>
      {submitted && problems.length > 0 && (
        <ErrorSummary
          takeFocus
          title="The sector needs a little more before it can be accepted."
          problems={problems}
        />
      )}
      {failure !== null && failure !== undefined && (
        <ErrorSummary takeFocus {...launchErrorSummary(failure)} />
      )}

      <p className={styles.intro}>
        Where the campaign begins: a region of the Forge, its settlements and the passages between
        them. Each settlement, location and passage is accepted on its own.
      </p>

      <SectorHeader
        campaignId={campaignId}
        form={form}
        submitted={submitted}
        onEdit={edit}
        pending={configure.isPending}
        configured={configured}
        onConfigure={handleConfigure}
      />

      <SectorPlaces
        campaignId={campaignId}
        workspace={workspace}
        form={form}
        update={update}
        persist={persist}
      />

      {blockers.length > 0 && (
        <section className={styles.panelPlain} aria-labelledby="sector-blockers-heading">
          <h3 className={styles.label} id="sector-blockers-heading">
            Still needed for this section
          </h3>
          <ul className={styles.blockers}>
            {blockers.map((problem) => (
              <li key={`${problem.code}:${problem.path}`}>{problem.message}</li>
            ))}
          </ul>
        </section>
      )}

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
      </div>
      <p className={styles.note}>
        {isHeaderDirty(form, baseline)
          ? 'You have work here that is not saved or accepted yet.'
          : 'Saving keeps your work without making it a campaign fact.'}
      </p>
    </div>
  );
}

/**
 * The region and the name (8.1, beat 7). The region's baseline is shown with
 * the rules' own citation, and said to be a floor (D-180): readiness blocks
 * fewer, and any number more is welcome.
 */
function SectorHeader({
  campaignId,
  form,
  submitted,
  onEdit,
  pending,
  configured,
  onConfigure,
}: {
  readonly campaignId: string;
  readonly form: SectorForm;
  readonly submitted: boolean;
  readonly onEdit: (next: SectorForm) => void;
  readonly pending: boolean;
  readonly configured: boolean;
  readonly onConfigure: () => void;
}) {
  const roll = useRollLaunchRecipe(campaignId);
  const [rolled, setRolled] = useState<string | undefined>(undefined);
  const baseline = form.region === '' ? undefined : baselineOf(form.region);

  const rollName = () =>
    roll.mutate(
      { kind: 'sector_name' },
      {
        onSuccess: (response) => {
          setRolled(response.results.map((result) => `${result.roll}: ${result.text}`).join(' · '));
          onEdit(applyNameRoll(form, response.results));
        },
      },
    );

  return (
    <section className={styles.block} aria-labelledby="sector-header-heading">
      <h3 className={styles.blockHeading} id="sector-header-heading">
        Region and name
      </h3>

      <fieldset className={styles.group} id={anchor('sector.region')}>
        <legend className={styles.label}>Region</legend>
        {REGIONS.map((region) => {
          const counts = baselineOf(region);
          return (
            <label key={region} className={styles.option}>
              <input
                type="radio"
                name="sector-region"
                checked={form.region === region}
                onChange={() => onEdit(setRegion(form, region))}
              />
              <span>
                <strong>{REGION_LABELS[region]}</strong> — {REGION_DESCRIPTIONS[region]}{' '}
                <span className={styles.help}>
                  ({counts.settlements} settlements, {counts.passages} passages)
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {baseline !== undefined && (
        <p className={styles.help} role="note">
          This region asks for at least {baseline.settlements} settlements and {baseline.passages}{' '}
          passages before launch. That is a floor, not a quota: add as many more as you like. (
          {baseline.citation}.)
          {configured &&
            ' Changing the region changes what it asks for; settlements you have already accepted keep their populations.'}
        </p>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={anchor('sector.name')}>
          Name
        </label>
        <div className={styles.row}>
          <input
            id={anchor('sector.name')}
            className={styles.input}
            value={form.name}
            aria-invalid={submitted && form.name.trim() === '' ? true : undefined}
            onChange={(event) => onEdit(setName(form, event.target.value))}
          />
          <button
            type="button"
            className={styles.secondary}
            disabled={roll.isPending}
            aria-label="Roll the sector name"
            onClick={rollName}
          >
            Roll
          </button>
        </div>
        {rolled !== undefined && <p className={styles.rolled}>Rolled {rolled}</p>}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={pending} onClick={onConfigure}>
          {configured ? 'Save the region and name' : 'Accept the region and name'}
        </button>
      </div>
    </section>
  );
}
