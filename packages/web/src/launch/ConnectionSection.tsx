import { useState } from 'react';

import { CHALLENGE_RANKS, type ChallengeRank, type CharacterId } from '@astrolabe/rules';
import type {
  LaunchWorkspaceResponse,
  OracleChip,
  RollLaunchOracleResponse,
} from '@astrolabe/shared';

import { useProposeConnection, useSaveConnection } from '../api/connection.js';
import { useRollLaunchOracle } from '../api/crew.js';
import { useSaveLaunchDraft } from '../api/launch.js';
import { useAiStatus } from '../api/narration.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { proposalFailureText } from './CrewProposalPanel.js';
import {
  CONNECTION_FIELDS,
  CONNECTION_FIELD_LABELS,
  CONNECTION_FIELD_ORACLES,
  applyFieldRoll,
  connectionTrack,
  dropConnectionProposal,
  editedConnectionFields,
  heldConnectionProposal,
  initialConnectionForm,
  setField,
  setRank,
  takeConnectionProposal,
  toConnectionDraft,
  toConnectionRequest,
  toggleParticipant,
  type ConnectionField,
  type ConnectionForm,
  type HeldConnectionProposal,
} from './connection-form.js';
import styles from './SectorSection.module.css';

const anchor = (field: string) => fieldAnchorId(`connection.${field}`);

/**
 * The Connection half of Connection and Troubles (9.1, beat 10, D-167).
 *
 * The crew made a connection at the starting settlement: an automatic strong
 * hit, the rules' own outcome, with no die rolled. What is left is who the
 * person is, how deep the bond runs (its rank), and who shares it. Write each
 * field, roll it from the declared NPC recipe, or ask the Guide and take what
 * you want of its answer. Accepting is what completes the connection.
 */
export function ConnectionSection({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const state = workspace.state;
  const [form, setForm] = useState<ConnectionForm>(() => initialConnectionForm(state));
  const [rolled, setRolled] = useState<Partial<Record<ConnectionField, string>>>({});
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [askFailure, setAskFailure] = useState<string | undefined>(undefined);
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);
  const [rolling, setRolling] = useState<ConnectionField | undefined>(undefined);
  const roll = useRollLaunchOracle(campaignId);
  const propose = useProposeConnection(campaignId);
  const save = useSaveConnection(campaignId);
  const saveDraft = useSaveLaunchDraft<'connection_troubles'>(campaignId);
  const guide = useAiStatus();
  const failure = roll.error ?? propose.error ?? save.error ?? saveDraft.error;

  const found = heldConnectionProposal(state);
  const held = found !== null && found.eventId !== dismissed ? found : null;
  const accepted = state.launch.connection !== undefined;
  const track = connectionTrack(state);
  const crew = Object.values(state.characters);
  // The server's word on the connection, beside it (D-176).
  const blockers = workspace.readiness.sections.connection_troubles.blockers.filter((problem) =>
    problem.path.startsWith('connection'),
  );
  const request = toConnectionRequest(form);

  const edit = (next: ConnectionForm) => {
    setSaved(undefined);
    setForm(next);
  };

  const rollField = async (field: ConnectionField) => {
    setRolling(field);
    try {
      const results: RollLaunchOracleResponse[] = [];
      for (const oracleId of CONNECTION_FIELD_ORACLES[field])
        results.push(await roll.mutateAsync(oracleId));
      setRolled((current) => ({
        ...current,
        [field]: results.map((result) => `${result.roll}: ${result.text}`).join(' · '),
      }));
      setSaved(undefined);
      // Against the form as it is when the roll lands, so an edit made while
      // the server rolled survives.
      setForm((current) => applyFieldRoll(current, field, results));
    } catch {
      // The failure is shown from the mutation's error.
    } finally {
      setRolling(undefined);
    }
  };

  return (
    <section className={styles.block} aria-labelledby="connection-heading">
      <h3 className={styles.blockHeading} id="connection-heading">
        Local connection
      </h3>
      <p className={styles.intro}>
        The crew has made a connection at the starting settlement. The rules make this an automatic
        strong hit, so no die is rolled for it. What you decide is who this person is, the
        connection’s rank, and which of the crew share it.
      </p>
      {failure !== null && failure !== undefined && (
        <p className={styles.unavailable} role="alert">
          {failure.message}
        </p>
      )}

      <GuidePanel
        held={held}
        form={form}
        chips={workspace.chips}
        pending={propose.isPending}
        aiAvailable={guide.data?.available === true}
        failure={askFailure}
        onAsk={() => {
          setAskFailure(undefined);
          setDismissed(undefined);
          propose.mutate(
            {},
            {
              onSuccess: (response) => {
                if (!response.ok) setAskFailure(proposalFailureText(response));
              },
            },
          );
        }}
        onTake={(fields) => held !== null && edit(takeConnectionProposal(form, held, fields))}
        onDismiss={() => {
          if (held !== null) setDismissed(held.eventId);
          edit(dropConnectionProposal(form));
        }}
      />

      {CONNECTION_FIELDS.map((field) => (
        <div key={field} className={styles.field}>
          <label className={styles.label} htmlFor={anchor(field)}>
            {CONNECTION_FIELD_LABELS[field]}
          </label>
          <div className={styles.row}>
            <input
              id={anchor(field)}
              className={styles.input}
              value={form[field]}
              onChange={(event) => edit(setField(form, field, event.target.value))}
            />
            <button
              type="button"
              className={styles.secondary}
              disabled={rolling !== undefined}
              aria-label={`Roll the connection’s ${CONNECTION_FIELD_LABELS[field].toLowerCase()}`}
              onClick={() => void rollField(field)}
            >
              {rolling === field ? 'Rolling…' : 'Roll'}
            </button>
          </div>
          {rolled[field] !== undefined && <p className={styles.rolled}>Rolled {rolled[field]}</p>}
        </div>
      ))}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={anchor('rank')}>
          Rank
        </label>
        <p className={styles.help}>How deep the bond has to run before it can be forged.</p>
        <select
          id={anchor('rank')}
          className={styles.input}
          value={form.rank}
          onChange={(event) => edit(setRank(form, event.target.value as ChallengeRank))}
        >
          {CHALLENGE_RANKS.map((rank) => (
            <option key={rank} value={rank}>
              {rank}
            </option>
          ))}
        </select>
      </div>

      <fieldset className={styles.group} id={anchor('participants')}>
        <legend className={styles.label}>Shared by</legend>
        <p className={styles.help}>Everyone ticked shares this connection and its track.</p>
        {crew.map((character) => (
          <label key={character.id} className={styles.choice}>
            <input
              type="checkbox"
              checked={form.participants.includes(character.id)}
              onChange={(event) =>
                edit(toggleParticipant(form, character.id as CharacterId, event.target.checked))
              }
            />
            <span>{character.name}</span>
          </label>
        ))}
        {crew.length === 0 && (
          <p className={styles.note}>Add the crew first; a connection is shared by crew.</p>
        )}
      </fieldset>

      {track !== undefined && (
        <section className={styles.panelPlain} aria-label="The connection’s progress track">
          <p className={styles.value}>
            {track.title} · {track.rank} · {track.boxes} of 10 boxes
          </p>
          <p className={styles.help}>Shared by {track.sharedBy.join(', ')}.</p>
        </section>
      )}

      {blockers.length > 0 && (
        <ul className={styles.blockers}>
          {blockers.map((problem) => (
            <li key={problem.code}>{problem.message}</li>
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
              { section: 'connection_troubles', snapshot: toConnectionDraft(state, form) },
              { onSuccess: () => setSaved('Saved as setup. This is not campaign canon yet.') },
            )
          }
        >
          Save and continue
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={save.isPending || request === null}
          onClick={() => {
            if (request === null) return;
            save.mutate(
              { body: request, revise: accepted },
              {
                onSuccess: () =>
                  setSaved(
                    accepted
                      ? 'Saved. The earlier version stays in the connection’s history.'
                      : 'Accepted. The crew has a connection here.',
                  ),
              },
            );
          }}
        >
          {accepted ? 'Save this revision' : 'Accept the connection'}
        </button>
      </div>
      {request === null && (
        <p className={styles.note}>
          A connection needs a name, a role, and at least one crew member to share it.
        </p>
      )}
    </section>
  );
}

/**
 * Asking the Guide for the person, and reviewing its answer field by field
 * (9.0c, D-166). Nothing here writes a fact: taking fields fills the form,
 * and only accepting the connection makes any of it canon (D-161).
 */
function GuidePanel({
  held,
  form,
  chips,
  pending,
  aiAvailable,
  failure,
  onAsk,
  onTake,
  onDismiss,
}: {
  readonly held: HeldConnectionProposal | null;
  readonly form: ConnectionForm;
  readonly chips: Readonly<Record<string, OracleChip>>;
  readonly pending: boolean;
  readonly aiAvailable: boolean;
  readonly failure: string | undefined;
  readonly onAsk: () => void;
  readonly onTake: (fields?: readonly ConnectionField[]) => void;
  readonly onDismiss: () => void;
}) {
  const edited = held === null ? [] : editedConnectionFields(form, held.proposal);
  const working = held !== null && form.proposalEventId === held.eventId;

  return (
    <section className={styles.panel} aria-labelledby="connection-guide-heading">
      <h4 className={styles.panelHeading} id="connection-guide-heading">
        Ask the Guide
      </h4>
      <p className={styles.help}>
        The server rolls the NPC recipe; the Guide reads the rolls into a person. It proposes no
        rank and no sharing crew: those are yours.
      </p>
      {!aiAvailable && (
        <p className={styles.unavailable} role="status">
          No Guide is available. Write the fields, or roll them.
        </p>
      )}
      {failure !== undefined && (
        <p className={styles.unavailable} role="status">
          {failure} The rolls the server made are still yours; nothing else changed.
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!aiAvailable || pending}
          onClick={onAsk}
        >
          {pending ? 'Asking…' : 'Ask the Guide'}
        </button>
      </div>

      {held !== null && (
        <div className={styles.review}>
          <p className={styles.help}>{held.rationale}</p>
          <dl className={styles.proposed}>
            {CONNECTION_FIELDS.map((field) => (
              <div key={field} className={styles.proposedRow}>
                <dt className={styles.label}>
                  {CONNECTION_FIELD_LABELS[field]}
                  {working && edited.includes(field) && (
                    <span className={styles.edited}> · you changed this</span>
                  )}
                </dt>
                <dd className={styles.proposedValue}>
                  <p className={styles.value}>{held.proposal[field].value}</p>
                  <p className={styles.reason}>{held.proposal[field].reason}</p>
                  <ul className={styles.chips}>
                    {held.proposal[field].groundedIn.map((eventId) => {
                      const chip = chips[eventId];
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
                    aria-label={`Use the Guide’s ${CONNECTION_FIELD_LABELS[field].toLowerCase()}`}
                    onClick={() => onTake([field])}
                  >
                    Use this
                  </button>
                </dd>
              </div>
            ))}
          </dl>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => onTake()}>
              Take the whole proposal
            </button>
            <button type="button" className={styles.secondary} onClick={onDismiss}>
              Discard it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
