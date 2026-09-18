import { useState } from 'react';

import type { LaunchWorkspaceResponse, OracleChip } from '@astrolabe/shared';

import { useRollLaunchOracle } from '../api/crew.js';
import { useSaveLaunchDraft } from '../api/launch.js';
import { useAiStatus } from '../api/narration.js';
import { useProposeStarship, useSaveStarship } from '../api/starship.js';
import { ErrorSummary } from '../ui/ErrorSummary.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { proposalFailureText } from './CrewProposalPanel.js';
import { launchErrorSummary } from './errors.js';
import {
  FIELD_LABELS,
  FIELD_ORACLES,
  applyRoll,
  detailProblems,
  dropProposal,
  editedFields,
  heldStarshipProposal,
  initialStarshipForm,
  isDirty,
  proposedFields,
  proposedGrounding,
  proposedReason,
  proposedValue,
  quirkCountOf,
  setQuirk,
  setQuirkCount,
  setText,
  takeProposal,
  toDraftSnapshot,
  toSaveRequest,
  type HeldStarshipProposal,
  type QuirkCount,
  type RollableField,
  type StarshipField,
  type StarshipForm,
} from './starship-form.js';
import styles from './StarshipSection.module.css';

/** A field's DOM id, from the same path the server's blockers use (`starship.name`). */
const anchor = (field: string) => fieldAnchorId(`starship.${field}`);

/**
 * The crew's one shared command starship (7.1, beat 6, D-164).
 *
 * Every way of filling a field is here and they all edit the same form: write
 * it, roll it from the declared starship recipe, or ask the Guide and take
 * what you want of the answer. **Save and continue** keeps the work without
 * making it canon; **Accept the ship** is what completes the section.
 */
export function StarshipSection({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const [baseline, setBaseline] = useState(() => initialStarshipForm(workspace.state));
  const [form, setForm] = useState<StarshipForm>(baseline);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [rolled, setRolled] = useState<Partial<Record<RollableField, string>>>({});
  const [askFailure, setAskFailure] = useState<string | undefined>(undefined);
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);

  const saveDraft = useSaveLaunchDraft<'starship'>(campaignId);
  const save = useSaveStarship(campaignId);
  const roll = useRollLaunchOracle(campaignId);
  const propose = useProposeStarship(campaignId);
  const guide = useAiStatus();
  const failure = save.error ?? saveDraft.error ?? roll.error ?? propose.error;

  const found = heldStarshipProposal(workspace.state);
  const held = found !== null && found.eventId !== dismissed ? found : null;
  const accepted = workspace.state.launch.starship !== undefined;
  const problems = detailProblems(form);

  const edit = (next: StarshipForm) => {
    setSaved(undefined);
    setForm(next);
  };

  const rollField = (field: RollableField) =>
    roll.mutate(FIELD_ORACLES[field], {
      onSuccess: (result) => {
        setRolled((current) => ({ ...current, [field]: `${result.roll}: ${result.text}` }));
        setSaved(undefined);
        // Against the form as it is when the roll lands, not as it was when
        // Roll was pressed: an edit made while the server rolled survives.
        setForm((current) =>
          applyRoll(current, field, { eventId: result.eventId, text: result.text }),
        );
      },
    });

  const handleSaveDraft = () => {
    saveDraft.mutate(
      { section: 'starship', snapshot: toDraftSnapshot(form) },
      { onSuccess: () => setSaved('Saved as setup. This is not campaign canon yet.') },
    );
  };

  const handleAccept = () => {
    const request = toSaveRequest(form);
    if (request === null) {
      setSubmitted(true);
      return;
    }
    setSubmitted(false);
    save.mutate(request, {
      onSuccess: () => {
        setBaseline(form);
        setSaved(
          accepted
            ? 'Saved. The earlier version stays in the ship’s history.'
            : 'Accepted. This is the crew’s ship.',
        );
      },
    });
  };

  return (
    <div className={styles.section}>
      {submitted && problems.length > 0 && (
        <ErrorSummary
          takeFocus
          title="The ship needs a little more before it can be accepted."
          problems={problems.map((problem) => ({
            path: `starship.${problem.field}`,
            message: problem.message,
          }))}
        />
      )}
      {failure !== null && failure !== undefined && (
        <ErrorSummary takeFocus {...launchErrorSummary(failure)} />
      )}

      <p className={styles.intro}>
        One ship for the whole crew. It is not copied onto each character: the crew shares it, and
        any module a character chose is installed on it under that character’s name.
      </p>

      <GuidePanel
        held={held}
        form={form}
        chips={workspace.chips}
        pending={propose.isPending}
        aiAvailable={guide.data?.available === true}
        aiReason={
          guide.data?.lastFailure === undefined
            ? undefined
            : proposalFailureText(guide.data.lastFailure)
        }
        failure={askFailure}
        onAsk={(quirkCount, fields) => {
          setAskFailure(undefined);
          setDismissed(undefined);
          propose.mutate(
            { quirkCount, ...(fields.length > 0 ? { fields } : {}) },
            {
              onSuccess: (response) => {
                if (!response.ok) setAskFailure(proposalFailureText(response));
              },
            },
          );
        }}
        onTake={(fields) => held !== null && edit(takeProposal(form, held, fields))}
        onDismiss={() => {
          if (held !== null) setDismissed(held.eventId);
          edit(dropProposal(form));
        }}
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor={anchor('name')}>
          Name
        </label>
        <div className={styles.row}>
          <input
            id={anchor('name')}
            className={styles.input}
            value={form.name}
            aria-invalid={submitted && form.name.trim() === '' ? true : undefined}
            onChange={(event) => edit(setText(form, 'name', event.target.value))}
          />
          <RollButton field="name" pending={roll.isPending} onRoll={rollField} />
        </div>
        <RolledNote text={rolled.name} />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={anchor('appearance')}>
          Appearance
        </label>
        <p className={styles.help}>What someone notices first about the ship.</p>
        <textarea
          id={anchor('appearance')}
          className={styles.textarea}
          rows={3}
          value={form.appearance}
          aria-invalid={submitted && form.appearance.trim() === '' ? true : undefined}
          onChange={(event) => edit(setText(form, 'appearance', event.target.value))}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={anchor('history')}>
          History
        </label>
        <div className={styles.row}>
          <textarea
            id={anchor('history')}
            className={styles.textarea}
            rows={3}
            value={form.history}
            aria-invalid={submitted && form.history.trim() === '' ? true : undefined}
            onChange={(event) => edit(setText(form, 'history', event.target.value))}
          />
          <RollButton field="history" pending={roll.isPending} onRoll={rollField} />
        </div>
        <RolledNote text={rolled.history} />
      </div>

      <fieldset className={styles.quirks}>
        <legend className={styles.label}>Quirks</legend>
        <p className={styles.help}>One or two. A quirk is something odd about the ship.</p>
        <div className={styles.count} role="radiogroup" aria-label="How many quirks">
          {([1, 2] as const).map((count) => (
            <label key={count} className={styles.choice}>
              <input
                type="radio"
                name="quirk-count"
                checked={quirkCountOf(form) === count}
                onChange={() => edit(setQuirkCount(form, count))}
              />
              <span>{count === 1 ? 'One quirk' : 'Two quirks'}</span>
            </label>
          ))}
        </div>
        {form.quirks.map((quirk, index) => {
          const field: RollableField = index === 0 ? 'quirk_1' : 'quirk_2';
          const id = index === 0 ? anchor('quirks') : anchor('quirks-2');
          return (
            <div key={field} className={styles.field}>
              <label className={styles.subLabel} htmlFor={id}>
                {FIELD_LABELS[field]}
              </label>
              <div className={styles.row}>
                <input
                  id={id}
                  className={styles.input}
                  value={quirk}
                  aria-invalid={submitted && quirk.trim() === '' ? true : undefined}
                  onChange={(event) => edit(setQuirk(form, index, event.target.value))}
                />
                <RollButton field={field} pending={roll.isPending} onRoll={rollField} />
              </div>
              <RolledNote text={rolled[field]} />
            </div>
          );
        })}
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
        <button
          type="button"
          className={styles.primary}
          disabled={save.isPending}
          onClick={handleAccept}
        >
          {accepted ? 'Save this revision' : 'Accept the ship'}
        </button>
      </div>
      <p className={styles.note}>
        {isDirty(form, baseline)
          ? 'You have work here that is not saved or accepted yet.'
          : 'Saving keeps your work without making it a campaign fact. Accepting the ship is what completes this section.'}
      </p>
    </div>
  );
}

function RollButton({
  field,
  pending,
  onRoll,
}: {
  readonly field: RollableField;
  readonly pending: boolean;
  readonly onRoll: (field: RollableField) => void;
}) {
  return (
    <button
      type="button"
      className={styles.secondary}
      disabled={pending}
      aria-label={`Roll the ${FIELD_LABELS[field].toLowerCase()}`}
      onClick={() => onRoll(field)}
    >
      Roll
    </button>
  );
}

/** The roll behind a field, in words, so a rolled value never looks hand-typed (A41). */
function RolledNote({ text }: { readonly text: string | undefined }) {
  return text === undefined ? null : <p className={styles.rolled}>Rolled {text}</p>;
}

const HELP_FIELDS: readonly StarshipField[] = ['name', 'appearance', 'history', 'quirk_1'];

/**
 * Asking the Guide for the ship, and reviewing its answer field by field
 * (7.0e, D-166). Nothing here writes a fact: taking fields fills the form,
 * and only accepting the ship makes any of it canon (D-161).
 */
function GuidePanel({
  held,
  form,
  chips,
  pending,
  aiAvailable,
  aiReason,
  failure,
  onAsk,
  onTake,
  onDismiss,
}: {
  readonly held: HeldStarshipProposal | null;
  readonly form: StarshipForm;
  readonly chips: Readonly<Record<string, OracleChip>>;
  readonly pending: boolean;
  readonly aiAvailable: boolean;
  readonly aiReason: string | undefined;
  readonly failure: string | undefined;
  readonly onAsk: (quirkCount: QuirkCount, fields: readonly StarshipField[]) => void;
  readonly onTake: (fields?: readonly StarshipField[]) => void;
  readonly onDismiss: () => void;
}) {
  const [wanted, setWanted] = useState<ReadonlySet<StarshipField>>(new Set());
  const edited = held === null ? [] : editedFields(form, held.proposal);
  const working = held !== null && form.proposalEventId === held.eventId;

  return (
    <section className={styles.panel} aria-labelledby="starship-guide-heading">
      <h3 className={styles.panelHeading} id="starship-guide-heading">
        Ask the Guide
      </h3>
      <p className={styles.help}>
        The server rolls the ship’s name, history and quirks; the Guide reads them into a proposal.
        You keep what you like and change the rest. Nothing is written until you accept the ship.
      </p>

      <fieldset className={styles.helpWith}>
        <legend className={styles.label}>Help with</legend>
        <p className={styles.help}>
          Leave these unticked for a whole ship. Tick a few and the Guide focuses there.
        </p>
        {HELP_FIELDS.map((field) => (
          <label key={field} className={styles.choice}>
            <input
              type="checkbox"
              checked={wanted.has(field)}
              onChange={(event) => {
                const next = new Set(wanted);
                if (event.target.checked) next.add(field);
                else next.delete(field);
                setWanted(next);
              }}
            />
            <span>{field === 'quirk_1' ? 'Quirks' : FIELD_LABELS[field]}</span>
          </label>
        ))}
      </fieldset>

      {!aiAvailable && (
        <p className={styles.unavailable} role="status">
          {aiReason ?? 'No Guide is configured.'} Every other way of building the ship still works:
          write the fields, or roll them.
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
          onClick={() => onAsk(quirkCountOf(form), [...wanted])}
        >
          {pending ? 'Asking…' : 'Ask the Guide'}
        </button>
      </div>

      {held !== null && (
        <div className={styles.review}>
          <h4 className={styles.panelHeading}>What the Guide proposed</h4>
          <p className={styles.help}>{held.rationale}</p>
          <dl className={styles.proposed}>
            {proposedFields(held.proposal).map((field) => (
              <div key={field} className={styles.proposedRow}>
                <dt className={styles.label}>
                  {FIELD_LABELS[field]}
                  {working && edited.includes(field) && (
                    <span className={styles.edited}> · you changed this</span>
                  )}
                </dt>
                <dd className={styles.proposedValue}>
                  <p className={styles.value}>{proposedValue(held.proposal, field)}</p>
                  <p className={styles.reason}>{proposedReason(held.proposal, field)}</p>
                  <ul className={styles.chips}>
                    {proposedGrounding(held.proposal, field).map((eventId) => {
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
