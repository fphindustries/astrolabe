import { useState } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useAiStatus } from '../api/narration.js';
import {
  useProposeTrouble,
  useRollLaunchRecipe,
  useSaveLocation,
  useSaveTrouble,
  useSetStartingSettlement,
} from '../api/sector.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { proposalFailureText } from './CrewProposalPanel.js';
import {
  applyStartingRecipe,
  heldTroubleProposal,
  markSettlementAccepted,
  setFirstLook,
  setFirstLookCount,
  setSettlementTrouble,
  startingChoices,
  takeTroubleProposal,
  toSettlementRequest,
  toSettlementTroubleRequest,
  type SectorForm,
} from './sector-form.js';
import { rollChipText } from './roll-chip.js';
import styles from './SectorSection.module.css';

type FormUpdate = (change: (form: SectorForm) => SectorForm) => SectorForm;

/**
 * Zooming in on the starting settlement (8.5, beat 9, A35, D-198).
 *
 * Choose where the campaign starts, then give it one or two first looks and
 * its trouble: rolled together from the starting-settlement recipe, or
 * written. The Guide reads the rolled trouble against the accepted truths
 * and the player edits its words; the roll stays the grounding. First looks
 * are the rolled phrases or the player's own (D-198). The starting planet's
 * fuller detail is in the settlement's planet fields.
 */
export function SectorStart({
  campaignId,
  workspace,
  form,
  update,
  persist,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
  readonly form: SectorForm;
  readonly update: FormUpdate;
  readonly persist: (form: SectorForm) => void;
}) {
  const state = workspace.state;
  const select = useSetStartingSettlement(campaignId);
  const roll = useRollLaunchRecipe(campaignId);
  const saveLocation = useSaveLocation(campaignId);
  const saveTrouble = useSaveTrouble(campaignId);
  const propose = useProposeTrouble(campaignId);
  const guide = useAiStatus();
  const [rolled, setRolled] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [askFailure, setAskFailure] = useState<string | undefined>(undefined);
  const failure =
    select.error ?? roll.error ?? saveLocation.error ?? saveTrouble.error ?? propose.error;

  const choices = startingChoices(form);
  const startId = state.launch.startingSettlementId;
  const start = choices.find((settlement) => settlement.locationId === startId);
  const held =
    start?.locationId === undefined
      ? null
      : heldTroubleProposal(state, { kind: 'settlement', ownerId: start.locationId });
  // Every roll behind the trouble: a row can embed Action + Theme (8.5).
  const troubleRolls = start?.troubleRolls ?? [];
  const at = (field: string) => fieldAnchorId(`sector.start.${field}`);

  return (
    <section className={styles.block} aria-labelledby="sector-start-heading">
      <h3 className={styles.blockHeading} id="sector-start-heading">
        Where the campaign starts
      </h3>
      {failure !== null && failure !== undefined && (
        <p className={styles.unavailable} role="alert">
          {failure.message}
        </p>
      )}
      {choices.length === 0 ? (
        <p className={styles.help}>Accept a settlement first; the campaign starts at one.</p>
      ) : (
        <fieldset className={styles.group}>
          <legend className={styles.label}>Starting settlement</legend>
          {choices.map((settlement) => (
            <label key={settlement.draftId} className={styles.option}>
              <input
                type="radio"
                name="starting-settlement"
                checked={settlement.locationId === startId}
                disabled={select.isPending}
                onChange={() => settlement.locationId && select.mutate(settlement.locationId)}
              />
              <span>{settlement.name}</span>
            </label>
          ))}
        </fieldset>
      )}

      {start !== undefined && (
        <>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={roll.isPending}
              onClick={() =>
                roll.mutate(
                  {
                    kind: 'starting_settlement',
                    firstLookCount: start.firstLooks.length >= 2 ? 2 : 1,
                  },
                  {
                    onSuccess: (response) => {
                      setSaved(undefined);
                      setRolled(
                        response.results
                          .map((result) => `${result.roll}: ${result.text}`)
                          .join(' · '),
                      );
                      update((current) =>
                        applyStartingRecipe(current, start.draftId, response.results),
                      );
                    },
                  },
                )
              }
            >
              Roll first looks and trouble
            </button>
          </div>
          {rolled !== undefined && <p className={styles.rolled}>Rolled {rolled}</p>}

          <fieldset className={styles.quirks}>
            <legend className={styles.label}>First looks</legend>
            <p className={styles.help}>What the crew notices first on arrival. One or two.</p>
            <div className={styles.count} role="radiogroup" aria-label="How many first looks">
              {([1, 2] as const).map((count) => (
                <label key={count} className={styles.choice}>
                  <input
                    type="radio"
                    name="first-look-count"
                    checked={(start.firstLooks.length >= 2 ? 2 : 1) === count}
                    onChange={() =>
                      update((current) => setFirstLookCount(current, start.draftId, count))
                    }
                  />
                  <span>{count === 1 ? 'One' : 'Two'}</span>
                </label>
              ))}
            </div>
            {(start.firstLooks.length === 0 ? [''] : start.firstLooks).map((look, index) => (
              <div key={index} className={styles.field}>
                <label className={styles.subLabel} htmlFor={at(`look-${index}`)}>
                  {index === 0 ? 'First look' : 'Second first look'}
                </label>
                <input
                  id={at(`look-${index}`)}
                  className={styles.input}
                  value={look}
                  onChange={(event) =>
                    update((current) =>
                      setFirstLook(
                        start.firstLooks.length === 0
                          ? setFirstLookCount(current, start.draftId, 1)
                          : current,
                        start.draftId,
                        index,
                        event.target.value,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={saveLocation.isPending || toSettlementRequest(start) === null}
                onClick={() => {
                  const request = toSettlementRequest(start);
                  if (request === null) return;
                  saveLocation.mutate(request, {
                    onSuccess: (response) => {
                      persist(
                        update((current) =>
                          markSettlementAccepted(
                            current,
                            start.draftId,
                            response.locationId,
                            response.planetId,
                          ),
                        ),
                      );
                      setSaved('The first looks are part of the settlement now.');
                    },
                  });
                }}
              >
                Save the first looks
              </button>
            </div>
          </fieldset>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={at('trouble')}>
              Its trouble
            </label>
            <textarea
              id={at('trouble')}
              className={styles.textarea}
              rows={2}
              value={start.trouble}
              onChange={(event) =>
                update((current) =>
                  setSettlementTrouble(current, start.draftId, event.target.value),
                )
              }
            />
          </div>

          <section className={styles.panel} aria-label="Ask the Guide to read the trouble">
            <p className={styles.help}>
              The Guide reads the rolled trouble against the accepted truths. You keep, edit or
              replace its words; the roll stays what it was built on.
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
                  guide.data?.available !== true ||
                  propose.isPending ||
                  troubleRolls.length === 0 ||
                  start.locationId === undefined
                }
                onClick={() => {
                  if (troubleRolls.length === 0 || start.locationId === undefined) return;
                  setAskFailure(undefined);
                  propose.mutate(
                    {
                      kind: 'settlement',
                      ownerId: start.locationId,
                      groundedIn: [...troubleRolls],
                    },
                    {
                      onSuccess: (response) => {
                        if (!response.ok) setAskFailure(proposalFailureText(response));
                      },
                    },
                  );
                }}
              >
                {propose.isPending ? 'Asking…' : 'Ask the Guide to read the trouble'}
              </button>
              {troubleRolls.length === 0 && (
                <span className={styles.note}>Roll the trouble first; the Guide reads a roll.</span>
              )}
            </div>
            {held !== null && held.proposal.kind === 'settlement' && (
              <div className={styles.review}>
                <p className={styles.value}>{held.proposal.text.value}</p>
                <p className={styles.reason}>{held.proposal.text.reason}</p>
                <ul className={styles.chips}>
                  {held.proposal.text.groundedIn.map((eventId) => {
                    const chip = workspace.chips[eventId];
                    return chip === undefined ? null : (
                      <li key={eventId} className={styles.chip}>
                        {rollChipText(chip)}
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() =>
                    update((current) => takeTroubleProposal(current, start.draftId, held))
                  }
                >
                  Use this
                </button>
              </div>
            )}
          </section>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={saveTrouble.isPending || toSettlementTroubleRequest(start) === null}
              onClick={() => {
                const request = toSettlementTroubleRequest(start);
                if (request === null) return;
                saveTrouble.mutate(request, {
                  onSuccess: () => setSaved('The settlement’s trouble is accepted.'),
                });
              }}
            >
              Accept the trouble
            </button>
          </div>
          {saved !== undefined && (
            <p className={styles.saved} role="status">
              {saved}
            </p>
          )}
        </>
      )}
    </section>
  );
}
