import { useState } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useSaveLaunchDraft } from '../api/launch.js';
import { useAiStatus } from '../api/narration.js';
import { useProposeTrouble, useRollLaunchRecipe, useSaveTrouble } from '../api/sector.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { proposalFailureText } from './CrewProposalPanel.js';
import { heldTroubleProposal } from './sector-form.js';
import {
  applySectorTroubleRoll,
  initialSectorTrouble,
  setSectorTroubleText,
  takeSectorTroubleProposal,
  toSectorTroubleRequest,
  toTroublesDraft,
  type SectorTroubleForm,
} from './troubles-form.js';
import styles from './SectorSection.module.css';

/**
 * The Troubles half of Connection and Troubles (8.5, beat 9, D-194).
 *
 * The sector trouble is edited here, where its blocker is reported, so the
 * section's status and the place it is fixed agree (D-176). The settlement's
 * trouble is edited with the starting settlement, in Starting Sector. The
 * connection is the other half, and group 9's.
 */
export function TroublesSection({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const state = workspace.state;
  const [form, setForm] = useState<SectorTroubleForm>(() => initialSectorTrouble(state));
  const [rolled, setRolled] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [askFailure, setAskFailure] = useState<string | undefined>(undefined);
  const roll = useRollLaunchRecipe(campaignId);
  const propose = useProposeTrouble(campaignId);
  const save = useSaveTrouble(campaignId);
  const saveDraft = useSaveLaunchDraft<'connection_troubles'>(campaignId);
  const guide = useAiStatus();
  const failure = roll.error ?? propose.error ?? save.error ?? saveDraft.error;
  const held = heldTroubleProposal(state, { kind: 'sector' });
  const trouble = Object.values(state.launch.troubles).find(
    (candidate) => candidate.kind === 'sector',
  );
  const edit = (next: SectorTroubleForm) => {
    setSaved(undefined);
    setForm(next);
  };

  return (
    <section className={styles.block} aria-labelledby="sector-trouble-heading">
      <h3 className={styles.blockHeading} id="sector-trouble-heading">
        Sector trouble
      </h3>
      <p className={styles.help}>
        What troubles the whole sector. The starting settlement’s own trouble is set with it, in
        Starting Sector.
      </p>
      {failure !== null && failure !== undefined && (
        <p className={styles.unavailable} role="alert">
          {failure.message}
        </p>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldAnchorId('sector.sectorTrouble')}>
          Sector trouble
        </label>
        <div className={styles.row}>
          <textarea
            id={fieldAnchorId('sector.sectorTrouble')}
            className={styles.textarea}
            rows={2}
            value={form.text}
            onChange={(event) => edit(setSectorTroubleText(form, event.target.value))}
          />
          <button
            type="button"
            className={styles.secondary}
            disabled={roll.isPending}
            aria-label="Roll the sector trouble"
            onClick={() =>
              roll.mutate(
                { kind: 'sector_trouble' },
                {
                  onSuccess: (response) => {
                    setRolled(
                      response.results
                        .map((result) => `${result.roll}: ${result.text}`)
                        .join(' · '),
                    );
                    edit(applySectorTroubleRoll(form, response.results));
                  },
                },
              )
            }
          >
            Roll
          </button>
        </div>
        {rolled !== undefined && <p className={styles.rolled}>Rolled {rolled}</p>}
      </div>

      <section className={styles.panel} aria-label="Ask the Guide to read the sector trouble">
        <p className={styles.help}>
          The Guide reads the rolled trouble against the accepted truths, and will not settle one
          left open. You keep, edit or replace its words.
        </p>
        {guide.data?.available !== true && (
          <p className={styles.unavailable} role="status">
            No Guide is available. Write the trouble, or keep the rolled words.
          </p>
        )}
        {askFailure !== undefined && (
          <p className={styles.unavailable} role="status">
            {askFailure}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={
              guide.data?.available !== true || propose.isPending || form.rolls.length === 0
            }
            onClick={() => {
              setAskFailure(undefined);
              propose.mutate(
                { kind: 'sector', groundedIn: [...form.rolls] },
                {
                  onSuccess: (response) => {
                    if (!response.ok) setAskFailure(proposalFailureText(response));
                  },
                },
              );
            }}
          >
            {propose.isPending ? 'Asking…' : 'Ask the Guide to read it'}
          </button>
          {form.rolls.length === 0 && (
            <span className={styles.note}>Roll the trouble first; the Guide reads a roll.</span>
          )}
        </div>
        {held !== null && (
          <div className={styles.review}>
            <p className={styles.value}>{held.proposal.text.value}</p>
            <p className={styles.reason}>{held.proposal.text.reason}</p>
            <ul className={styles.chips}>
              {held.proposal.text.groundedIn.map((eventId) => {
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
              className={styles.secondary}
              onClick={() =>
                edit(
                  takeSectorTroubleProposal(form, {
                    eventId: held.eventId,
                    text: held.proposal.text.value,
                  }),
                )
              }
            >
              Use this
            </button>
          </div>
        )}
      </section>

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
              { section: 'connection_troubles', snapshot: toTroublesDraft(state, form) },
              { onSuccess: () => setSaved('Saved as setup. This is not campaign canon yet.') },
            )
          }
        >
          Save and continue
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={save.isPending || toSectorTroubleRequest(form) === null}
          onClick={() => {
            const request = toSectorTroubleRequest(form);
            if (request === null) return;
            save.mutate(request, {
              onSuccess: () =>
                setSaved(
                  trouble === undefined
                    ? 'Accepted. This is what troubles the sector.'
                    : 'Saved. The earlier version stays in the trouble’s history.',
                ),
            });
          }}
        >
          {trouble === undefined ? 'Accept the sector trouble' : 'Save this revision'}
        </button>
      </div>
    </section>
  );
}
