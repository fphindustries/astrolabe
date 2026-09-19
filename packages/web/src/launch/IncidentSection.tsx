import { useState } from 'react';

import { CHALLENGE_RANKS, type ChallengeRank } from '@astrolabe/rules';
import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useAcceptIncident, useProposeIncidents } from '../api/incident.js';
import { useSaveLaunchDraft } from '../api/launch.js';
import { useAiStatus } from '../api/narration.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { proposalFailureText } from './CrewProposalPanel.js';
import {
  chooseOption,
  drawsOnNames,
  heldIncidentOptions,
  initialIncidentForm,
  setIncidentRank,
  setIncidentText,
  toIncidentDraft,
  toIncidentRequest,
  writeOwn,
  type IncidentForm,
} from './incident-form.js';
import styles from './SectorSection.module.css';

/**
 * The Incident half of Incident and Launch (9.2, beat 11, A37, D-200).
 *
 * Ask the Guide for three incidents, each showing its rolls and what it draws
 * on. Choose one and edit its words, ask again, or write your own, then
 * accept. Accepting records the words, the rank and what it drew on; who
 * swears the vow, who shares it and the opening scene are chosen on the review
 * page.
 */
export function IncidentSection({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const state = workspace.state;
  const [form, setForm] = useState<IncidentForm>(() => initialIncidentForm(state));
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [askFailure, setAskFailure] = useState<string | undefined>(undefined);
  const propose = useProposeIncidents(campaignId);
  const accept = useAcceptIncident(campaignId);
  const saveDraft = useSaveLaunchDraft<'incident_launch'>(campaignId);
  const guide = useAiStatus();
  const failure = propose.error ?? accept.error ?? saveDraft.error;
  const held = heldIncidentOptions(state);
  const accepted = state.launch.incident !== undefined;
  const request = toIncidentRequest(form);
  const blockers = workspace.readiness.sections.incident_launch.blockers;

  const edit = (next: IncidentForm) => {
    setSaved(undefined);
    setForm(next);
  };

  return (
    <section className={styles.block} aria-labelledby="incident-heading">
      <h3 className={styles.blockHeading} id="incident-heading">
        Inciting incident
      </h3>
      <p className={styles.intro}>
        The situation that sets the crew on their way. It becomes the campaign’s first vow, sworn
        with Swear an Iron Vow when Session 1 begins. Here you settle what it is and its rank; who
        swears it, who shares it and the opening scene are chosen on the review page.
      </p>
      {failure !== null && failure !== undefined && (
        <p className={styles.unavailable} role="alert">
          {failure.message}
        </p>
      )}

      <section className={styles.panel} aria-labelledby="incident-guide-heading">
        <h4 className={styles.panelHeading} id="incident-guide-heading">
          Ask the Guide
        </h4>
        <p className={styles.help}>
          The server rolls an incident for each of three options; the Guide ties each to what the
          campaign has accepted. Choose one and edit it, ask again, or write your own.
        </p>
        {guide.data?.available !== true && (
          <p className={styles.unavailable} role="status">
            No Guide is available. Write the incident yourself.
          </p>
        )}
        {askFailure !== undefined && (
          <p className={styles.unavailable} role="status">
            {askFailure} The rolls the server made are still yours; nothing else changed.
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={guide.data?.available !== true || propose.isPending}
            onClick={() => {
              setAskFailure(undefined);
              propose.mutate(undefined, {
                onSuccess: (response) => {
                  if (!response.ok) setAskFailure(proposalFailureText(response));
                },
              });
            }}
          >
            {propose.isPending ? 'Asking…' : held === undefined ? 'Ask the Guide' : 'Ask again'}
          </button>
        </div>

        {held !== undefined && (
          <ol className={styles.roster} aria-label="The Guide’s incidents">
            {held.options.map((option, index) => {
              const chosen =
                form.source?.eventId === held.eventId && form.source.optionIndex === index;
              const drawsOn = drawsOnNames(state, option);
              return (
                <li key={`${held.eventId}-${index}`} className={styles.review}>
                  <p className={styles.value}>
                    {option.title} <span className={styles.note}>({option.rank})</span>
                  </p>
                  <p className={styles.help}>{option.situation}</p>
                  <p className={styles.reason}>{option.reason}</p>
                  {drawsOn.length > 0 && (
                    <p className={styles.help}>Draws on {drawsOn.join(', ')}.</p>
                  )}
                  <ul className={styles.chips}>
                    {option.groundedIn.map((eventId) => {
                      const chip = workspace.chips[eventId];
                      return chip === undefined ? null : (
                        <li key={eventId} className={styles.chip}>
                          {chip.oracleId.split('/').at(-1)} {chip.roll}: {chip.rowText}
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    className={chosen ? styles.primary : styles.secondary}
                    aria-pressed={chosen}
                    onClick={() => edit(chooseOption(held.eventId, index, option))}
                  >
                    {chosen ? 'Chosen' : 'Choose this'}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldAnchorId('incident')}>
          The incident, as the vow is sworn
        </label>
        {form.source !== undefined && (
          <p className={styles.help}>
            From the Guide’s option. Edit it freely; it is recorded as the Guide’s, edited.{' '}
            <button type="button" className={styles.secondary} onClick={() => edit(writeOwn(form))}>
              Write my own instead
            </button>
          </p>
        )}
        <textarea
          id={fieldAnchorId('incident')}
          className={styles.textarea}
          rows={2}
          value={form.text}
          onChange={(event) => edit(setIncidentText(form, event.target.value))}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldAnchorId('incident.rank')}>
          Rank
        </label>
        <p className={styles.help}>It sizes the vow. The review page can still change it.</p>
        <select
          id={fieldAnchorId('incident.rank')}
          className={styles.input}
          value={form.rank}
          onChange={(event) => edit(setIncidentRank(form, event.target.value as ChallengeRank))}
        >
          {CHALLENGE_RANKS.map((rank) => (
            <option key={rank} value={rank}>
              {rank}
            </option>
          ))}
        </select>
      </div>

      {blockers.length > 0 && (
        <ul className={styles.blockers}>
          {blockers.map((problem) => (
            <li key={problem.code}>
              {problem.message}
              {problem.code === 'incident_vow_choices_missing' && ' They are on the review page.'}
            </li>
          ))}
        </ul>
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
          onClick={() =>
            saveDraft.mutate(
              { section: 'incident_launch', snapshot: toIncidentDraft(form) },
              { onSuccess: () => setSaved('Saved as setup. This is not campaign canon yet.') },
            )
          }
        >
          Save and continue
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={accept.isPending || request === null}
          onClick={() => {
            if (request === null) return;
            accept.mutate(request, {
              onSuccess: () =>
                setSaved(
                  accepted
                    ? 'Saved. The earlier version stays in the incident’s history.'
                    : 'Accepted. Choose who swears it on the review page.',
                ),
            });
          }}
        >
          {accepted ? 'Save this revision' : 'Accept the incident'}
        </button>
      </div>
    </section>
  );
}
