import { useEffect, useRef, useState } from 'react';

import { planetClassFromRow } from '@astrolabe/rules';
import type { LaunchWorkspaceResponse, OracleChip } from '@astrolabe/shared';

import { useRollLaunchOracle } from '../api/crew.js';
import { useAiStatus } from '../api/narration.js';
import {
  useAskForSettlement,
  useProposeSector,
  useRemoveLocation,
  useRollLaunchRecipe,
  useSaveLocation,
} from '../api/sector.js';
import { ErrorSummary } from '../ui/ErrorSummary.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { proposalFailureText } from './CrewProposalPanel.js';
import { PlanetFields } from './SectorDetails.js';
import {
  LOCATION_LABELS,
  PROPOSED_FIELD_LABELS,
  SETTLEMENT_FIELD_LABELS,
  addOther,
  addProposedSettlements,
  addSettlement,
  applySettlementFieldRoll,
  applyPlanetClassRoll,
  applyPlanetRecipe,
  applySettlementRecipe,
  discardSettlement,
  dropSettlementProposal,
  findSettlement,
  forgetOther,
  forgetSettlement,
  heldSettlementProposal,
  isStartingSettlement,
  markOtherAccepted,
  markSettlementAccepted,
  proposedSettlementFields,
  proposedSettlementGrounding,
  proposedSettlementReasons,
  proposedSettlementValue,
  rolledLocationHasPlanet,
  setOther,
  setProject,
  setProjectCount,
  setSettlementLocation,
  setSettlementText,
  settlementFieldOracle,
  settlementProblems,
  settlementProgress,
  takeSettlementProposal,
  toOtherRequest,
  toSettlementRequest,
  type HeldSettlementProposal,
  type ProposedSettlementField,
  type SectorForm,
  type SettlementForm,
  type SettlementRollField,
} from './sector-form.js';
import { rollChipText } from './roll-chip.js';
import styles from './SectorSection.module.css';

/**
 * Apply a transition to the latest form and return the result, so a caller
 * that must also save it saves exactly what the screen now shows.
 */
type FormUpdate = (change: (form: SectorForm) => SectorForm) => SectorForm;

/**
 * The sector's settlements and other known locations (8.2, beat 7, A32).
 *
 * Each is built the same four ways — write it, roll a field, roll it whole,
 * or ask the Guide — and accepted on its own. Accepting writes the server's
 * id back into the form and saves the draft, so a reload never shows a
 * settlement twice: once accepted, once as the work it was built from.
 */
export function SectorPlaces({
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
  /** Save the draft as the form now stands, after the server has answered. */
  readonly persist: (form: SectorForm) => void;
}) {
  const [open, setOpen] = useState<string | undefined>(form.settlements[0]?.draftId);
  const [wholeFailure, setWholeFailure] = useState<string | undefined>(undefined);
  const progress = settlementProgress(workspace.state, form.region);
  const configured = workspace.state.launch.sector !== undefined;
  const whole = useProposeSector(campaignId);
  const guide = useAiStatus();

  // 8.6 (D-196): one proposal per object. Each proposed settlement joins the
  // form under the key the server minted for it, and the draft is saved, so a
  // reload keeps them; each is reviewed and accepted on its own, like any other.
  const askForWholeSector = () => {
    setWholeFailure(undefined);
    whole.mutate(undefined, {
      onSuccess: (response) => {
        const targets = response.settlements.flatMap((settlement) =>
          settlement.ok ? [settlement.targetId] : [],
        );
        const failed = [response.name, ...response.settlements].find((part) => !part.ok);
        if (failed !== undefined && !failed.ok) setWholeFailure(proposalFailureText(failed));
        if (targets.length === 0) return;
        persist(update((current) => addProposedSettlements(current, targets)));
        setOpen(targets[0]);
      },
    });
  };

  const addNew = () => {
    const draftId = crypto.randomUUID();
    update((current) => addSettlement(current, draftId));
    setOpen(draftId);
  };

  return (
    <>
      <section className={styles.block} aria-labelledby="sector-settlements-heading">
        <h3 className={styles.blockHeading} id="sector-settlements-heading">
          Settlements
        </h3>
        <p className={styles.help} role="status">
          {progress.required === undefined
            ? `${progress.accepted} accepted in this sector. Choose a region to see how many it asks for.`
            : `${progress.accepted} accepted in this sector; the region asks for at least ${progress.required}.${
                progress.accepted >= progress.required
                  ? ' The region’s floor is met; more are welcome.'
                  : ''
              }`}
        </p>
        {!configured && (
          <p className={styles.help}>Accept the region and name first; settlements belong to it.</p>
        )}

        <section className={styles.panel} aria-label="Ask the Guide for the whole sector">
          <p className={styles.help}>
            The server rolls a name and as many settlements as the region asks for, each with its
            planet where it has one; the Guide reads each into a proposal. You review them one at a
            time below, and draw the passages yourself.
          </p>
          {guide.data?.available !== true && (
            <p className={styles.unavailable} role="status">
              No Guide is available. Every settlement can still be written or rolled.
            </p>
          )}
          {wholeFailure !== undefined && (
            <p className={styles.unavailable} role="status">
              {wholeFailure} The rolls and any proposals already made are still yours.
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={!configured || guide.data?.available !== true || whole.isPending}
              onClick={askForWholeSector}
            >
              {whole.isPending ? 'Asking…' : 'Ask the Guide for the whole sector'}
            </button>
          </div>
        </section>

        <ul className={styles.roster}>
          {form.settlements.map((settlement) => (
            <li key={settlement.draftId} className={styles.rosterRow}>
              <span>
                <strong>
                  {settlement.name.trim() === '' ? 'Unnamed settlement' : settlement.name}
                </strong>{' '}
                <span className={styles.help}>
                  {settlement.locationId === undefined ? '— not accepted yet' : '— accepted'}
                </span>
              </span>
              <button
                type="button"
                className={styles.secondary}
                aria-expanded={open === settlement.draftId}
                onClick={() =>
                  setOpen(open === settlement.draftId ? undefined : settlement.draftId)
                }
              >
                {open === settlement.draftId ? 'Close' : 'Open'}
              </button>
            </li>
          ))}
        </ul>

        {open !== undefined && findSettlement(form, open) !== undefined && (
          <SettlementEditor
            key={open}
            campaignId={campaignId}
            workspace={workspace}
            settlement={findSettlement(form, open)!}
            form={form}
            update={update}
            persist={persist}
            onClosed={() => setOpen(undefined)}
          />
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={!configured}
            onClick={addNew}
          >
            Add a settlement
          </button>
        </div>
      </section>

      <OtherLocations
        campaignId={campaignId}
        form={form}
        update={update}
        persist={persist}
        configured={configured}
      />
    </>
  );
}

/** One settlement's editor. Every change goes through a `sector-form.ts` transition. */
function SettlementEditor({
  campaignId,
  workspace,
  settlement,
  form,
  update,
  persist,
  onClosed,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
  readonly settlement: SettlementForm;
  readonly form: SectorForm;
  readonly update: FormUpdate;
  readonly persist: (form: SectorForm) => void;
  readonly onClosed: () => void;
}) {
  const draftId = settlement.draftId;
  const at = (field: string) => fieldAnchorId(`sector.settlements.${draftId}.${field}`);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [rolled, setRolled] = useState<Partial<Record<SettlementRollField, string>>>({});
  const [askFailure, setAskFailure] = useState<string | undefined>(undefined);
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('');
  // 10.4: the editor opens above the Add button that opened it, so focus
  // moves to it rather than staying fourteen stops below.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const rollField = useRollLaunchOracle(campaignId);
  const rollWhole = useRollLaunchRecipe(campaignId);
  const ask = useAskForSettlement(campaignId);
  const save = useSaveLocation(campaignId);
  const remove = useRemoveLocation(campaignId);
  const guide = useAiStatus();
  const failure = save.error ?? rollField.error ?? rollWhole.error ?? ask.error ?? remove.error;

  const region = form.region;
  const found = heldSettlementProposal(workspace.state, settlement);
  const held = found !== null && found.eventId !== dismissed ? found : null;
  const problems = settlementProblems(settlement);
  // The server's word on this settlement, beside it (D-176). Its blockers are
  // keyed by the accepted id; a settlement not yet accepted has none.
  const blockers =
    settlement.locationId === undefined
      ? []
      : workspace.readiness.sections.sector.blockers.filter((problem) =>
          problem.path.startsWith(`sector.settlements.${settlement.locationId}`),
        );

  const edit = (change: (current: SectorForm) => SectorForm) => {
    setSaved(undefined);
    return update(change);
  };

  const onRollField = (field: SettlementRollField) => {
    if (region === '') return;
    rollField.mutate(settlementFieldOracle(region, field), {
      onSuccess: (result) => {
        setRolled((current) => ({ ...current, [field]: `${result.roll}: ${result.text}` }));
        edit((current) =>
          applySettlementFieldRoll(current, draftId, field, {
            eventId: result.eventId,
            text: result.text,
          }),
        );
      },
    });
  };

  const onRollWhole = async () => {
    if (region === '') return;
    try {
      const response = await rollWhole.mutateAsync({
        kind: 'settlement',
        region,
        projectCount: settlement.projects.length >= 2 ? 2 : 1,
      });
      setRolled(
        Object.fromEntries(
          response.results.map((result) => [result.slot, `${result.roll}: ${result.text}`]),
        ),
      );
      edit((current) => applySettlementRecipe(current, draftId, response.results));
      // 10.4: the whole settlement includes its planet where it has one, as
      // the copy above says; without this a hand-rolled one was left short.
      if (!rolledLocationHasPlanet(response.results)) return;
      const classRolled = await rollWhole.mutateAsync({ kind: 'planet_class' });
      const classRow = classRolled.results[0];
      if (classRow === undefined) return;
      edit((current) => applyPlanetClassRoll(current, draftId, classRow));
      const planetClass = planetClassFromRow(classRow.text);
      if (planetClass === undefined) return;
      const planet = await rollWhole.mutateAsync({ kind: 'planet', planetClass, depth: 'shallow' });
      edit((current) => applyPlanetRecipe(current, draftId, planet.results));
    } catch {
      // Shown through `rollWhole.error`, with every roll that did land kept.
    }
  };

  const onAccept = () => {
    const request = toSettlementRequest(settlement);
    if (request === null) {
      setSubmitted(true);
      return;
    }
    setSubmitted(false);
    const wasAccepted = settlement.locationId !== undefined;
    save.mutate(request, {
      onSuccess: (response) => {
        persist(
          update((current) =>
            markSettlementAccepted(current, draftId, response.locationId, response.planetId),
          ),
        );
        setSaved(
          wasAccepted
            ? 'Saved. The earlier version stays in this settlement’s history.'
            : 'Accepted. This settlement is part of the sector.',
        );
      },
    });
  };

  const onRemove = () => {
    if (settlement.locationId === undefined) {
      update((current) => discardSettlement(current, draftId));
      onClosed();
      return;
    }
    remove.mutate(
      { locationId: settlement.locationId, reason },
      {
        onSuccess: () => {
          persist(update((current) => forgetSettlement(current, draftId)));
          onClosed();
        },
      },
    );
  };

  return (
    <section className={styles.editor} aria-labelledby={`settlement-${draftId}-heading`}>
      <h4
        className={styles.panelHeading}
        id={`settlement-${draftId}-heading`}
        ref={headingRef}
        tabIndex={-1}
      >
        {settlement.name.trim() === '' ? 'New settlement' : settlement.name}
      </h4>
      {submitted && problems.length > 0 && (
        <ErrorSummary
          takeFocus
          title="The settlement needs a little more before it can be accepted."
          problems={problems}
        />
      )}
      {failure !== null && failure !== undefined && (
        <ErrorSummary
          takeFocus
          title="That did not go through."
          problems={[{ path: `sector.settlements.${draftId}.name`, message: failure.message }]}
        />
      )}

      <SettlementGuide
        held={held}
        chips={workspace.chips}
        pending={ask.isPending}
        aiAvailable={guide.data?.available === true && region !== ''}
        aiReason={
          region === ''
            ? 'Choose the region first: the settlement’s population table is the region’s own.'
            : guide.data?.lastFailure === undefined
              ? undefined
              : proposalFailureText(guide.data.lastFailure)
        }
        failure={askFailure}
        onAsk={() => {
          if (region === '') return;
          setAskFailure(undefined);
          setDismissed(undefined);
          ask.mutate(
            {
              targetId: settlement.locationId ?? draftId,
              region,
              projectCount: settlement.projects.length >= 2 ? 2 : 1,
            },
            {
              onSuccess: (response) => {
                if (!response.ok) setAskFailure(proposalFailureText(response));
              },
            },
          );
        }}
        onTake={(fields) =>
          held !== null && edit((current) => takeSettlementProposal(current, draftId, held, fields))
        }
        onDismiss={() => {
          if (held !== null) setDismissed(held.eventId);
          edit((current) => dropSettlementProposal(current, draftId));
        }}
      />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={rollWhole.isPending || region === ''}
          onClick={onRollWhole}
        >
          Roll the whole settlement
        </button>
      </div>

      <TextField
        id={at('name')}
        label="Name"
        value={settlement.name}
        invalid={submitted && settlement.name.trim() === ''}
        onChange={(text) => edit((current) => setSettlementText(current, draftId, 'name', text))}
        onRoll={() => onRollField('name')}
        rollDisabled={rollField.isPending || region === ''}
        rolled={rolled.name}
      />

      <fieldset className={styles.group} id={at('location')}>
        <legend className={styles.label}>Location</legend>
        <div className={styles.row}>
          <div className={styles.count}>
            {(['planetside', 'orbital', 'deep_space'] as const).map((location) => (
              <label key={location} className={styles.choice}>
                <input
                  type="radio"
                  name={`location-${draftId}`}
                  checked={settlement.location === location}
                  onChange={() =>
                    edit((current) => setSettlementLocation(current, draftId, location))
                  }
                />
                <span>{LOCATION_LABELS[location]}</span>
              </label>
            ))}
          </div>
          <RollButton
            label="Roll the location"
            disabled={rollField.isPending || region === ''}
            onRoll={() => onRollField('location')}
          />
        </div>
        {rolled.location !== undefined && <p className={styles.rolled}>Rolled {rolled.location}</p>}
      </fieldset>

      <PlanetFields
        campaignId={campaignId}
        settlement={settlement}
        starting={isStartingSettlement(workspace.state, settlement)}
        update={edit}
      />

      <TextField
        id={at('population')}
        label="Population"
        value={settlement.population}
        invalid={submitted && settlement.population.trim() === ''}
        onChange={(text) =>
          edit((current) => setSettlementText(current, draftId, 'population', text))
        }
        onRoll={() => onRollField('population')}
        rollDisabled={rollField.isPending || region === ''}
        rolled={rolled.population}
      />
      <TextField
        id={at('authority')}
        label="Authority"
        value={settlement.authority}
        invalid={submitted && settlement.authority.trim() === ''}
        onChange={(text) =>
          edit((current) => setSettlementText(current, draftId, 'authority', text))
        }
        onRoll={() => onRollField('authority')}
        rollDisabled={rollField.isPending || region === ''}
        rolled={rolled.authority}
      />

      <fieldset className={styles.quirks} id={at('projects')}>
        <legend className={styles.label}>Projects</legend>
        <p className={styles.help}>One or two: what the settlement is working on.</p>
        <div className={styles.count} role="radiogroup" aria-label="How many projects">
          {([1, 2] as const).map((count) => (
            <label key={count} className={styles.choice}>
              <input
                type="radio"
                name={`projects-${draftId}`}
                checked={(settlement.projects.length >= 2 ? 2 : 1) === count}
                onChange={() => edit((current) => setProjectCount(current, draftId, count))}
              />
              <span>{count === 1 ? 'One project' : 'Two projects'}</span>
            </label>
          ))}
        </div>
        {settlement.projects.map((project, index) => {
          const field: SettlementRollField = index === 0 ? 'project_1' : 'project_2';
          return (
            <TextField
              key={field}
              id={at(field)}
              label={SETTLEMENT_FIELD_LABELS[field]}
              value={project}
              invalid={submitted && project.trim() === ''}
              onChange={(text) => edit((current) => setProject(current, draftId, index, text))}
              onRoll={() => onRollField(field)}
              rollDisabled={rollField.isPending || region === ''}
              rolled={rolled[field]}
            />
          );
        })}
      </fieldset>

      {blockers.length > 0 && (
        <ul className={styles.blockers}>
          {blockers.map((problem) => (
            <li key={`${problem.code}:${problem.path}`}>{problem.message}</li>
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
          className={styles.primary}
          disabled={save.isPending}
          onClick={onAccept}
        >
          {settlement.locationId === undefined ? 'Accept this settlement' : 'Save this revision'}
        </button>
        {!removing ? (
          <button type="button" className={styles.secondary} onClick={() => setRemoving(true)}>
            {settlement.locationId === undefined ? 'Discard' : 'Remove'}
          </button>
        ) : settlement.locationId === undefined ? (
          <button type="button" className={styles.secondary} onClick={onRemove}>
            Discard this unaccepted settlement
          </button>
        ) : (
          <span className={styles.row}>
            <label className={styles.subLabel} htmlFor={at('remove-reason')}>
              Why remove it?
            </label>
            <input
              id={at('remove-reason')}
              className={styles.input}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <button
              type="button"
              className={styles.secondary}
              disabled={reason.trim() === '' || remove.isPending}
              onClick={onRemove}
            >
              Remove
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  invalid,
  onChange,
  onRoll,
  rollDisabled,
  rolled,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly invalid: boolean;
  readonly onChange: (text: string) => void;
  readonly onRoll: () => void;
  readonly rollDisabled: boolean;
  readonly rolled: string | undefined;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.row}>
        <input
          id={id}
          className={styles.input}
          value={value}
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <RollButton
          label={`Roll the ${label.toLowerCase()}`}
          disabled={rollDisabled}
          onRoll={onRoll}
        />
      </div>
      {rolled !== undefined && <p className={styles.rolled}>Rolled {rolled}</p>}
    </div>
  );
}

function RollButton({
  label,
  disabled,
  onRoll,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onRoll: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.secondary}
      disabled={disabled}
      aria-label={label}
      onClick={onRoll}
    >
      Roll
    </button>
  );
}

/**
 * Asking the Guide for this settlement and reviewing its answer field by
 * field (8.0e, D-166). Nothing here writes a fact: taking fields fills the
 * form, and only accepting the settlement makes any of it canon (D-161).
 */
function SettlementGuide({
  held,
  chips,
  pending,
  aiAvailable,
  aiReason,
  failure,
  onAsk,
  onTake,
  onDismiss,
}: {
  readonly held: HeldSettlementProposal | null;
  readonly chips: Readonly<Record<string, OracleChip>>;
  readonly pending: boolean;
  readonly aiAvailable: boolean;
  readonly aiReason: string | undefined;
  readonly failure: string | undefined;
  readonly onAsk: () => void;
  readonly onTake: (fields?: readonly ProposedSettlementField[]) => void;
  readonly onDismiss: () => void;
}) {
  return (
    <section className={styles.panel} aria-label="Ask the Guide for this settlement">
      <p className={styles.help}>
        The server rolls the settlement, and a planet if it has one; the Guide reads the rolls into
        a proposal. Nothing is written until you accept the settlement.
      </p>
      {!aiAvailable && (
        <p className={styles.unavailable} role="status">
          {aiReason ?? 'No Guide is configured.'} Every other way still works: write the fields, or
          roll them.
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
          <h5 className={styles.panelHeading}>What the Guide proposed</h5>
          <p className={styles.help}>{held.rationale}</p>
          <dl className={styles.proposed}>
            {proposedSettlementFields(held.proposal).map((field) => (
              <div key={field} className={styles.proposedRow}>
                <dt className={styles.label}>{PROPOSED_FIELD_LABELS[field]}</dt>
                <dd className={styles.proposedValue}>
                  {proposedSettlementValue(held.proposal, field).map((value) => (
                    <p key={value} className={styles.value}>
                      {value}
                    </p>
                  ))}
                  {proposedSettlementReasons(held.proposal, field).map((reason) => (
                    <p key={reason} className={styles.reason}>
                      {reason}
                    </p>
                  ))}
                  <ul className={styles.chips}>
                    {proposedSettlementGrounding(held.proposal, field).map((eventId) => {
                      const chip = chips[eventId];
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

/**
 * Known places that are not settlements, such as Kessel Drift (beat 7). They
 * are nodes on the map like settlements, and are written by hand.
 */
function OtherLocations({
  campaignId,
  form,
  update,
  persist,
  configured,
}: {
  readonly campaignId: string;
  readonly form: SectorForm;
  readonly update: FormUpdate;
  readonly persist: (form: SectorForm) => void;
  readonly configured: boolean;
}) {
  const save = useSaveLocation(campaignId);
  const remove = useRemoveLocation(campaignId);
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const failure = save.error ?? remove.error;

  const accept = (draftId: string) => {
    const other = form.others.find((candidate) => candidate.draftId === draftId);
    const request = other === undefined ? null : toOtherRequest(other);
    if (request === null) return;
    save.mutate(request, {
      onSuccess: (response) => {
        persist(update((current) => markOtherAccepted(current, draftId, response.locationId)));
      },
    });
  };

  const drop = (draftId: string, locationId: string | undefined) => {
    const forget = () => {
      const next = update((current) => forgetOther(current, draftId));
      if (locationId !== undefined) persist(next);
    };
    if (locationId === undefined) forget();
    else remove.mutate({ locationId, reason: reasons[draftId] ?? '' }, { onSuccess: forget });
  };

  return (
    <section className={styles.block} aria-labelledby="sector-others-heading">
      <h3 className={styles.blockHeading} id="sector-others-heading">
        Other known locations
      </h3>
      <p className={styles.help}>
        Places that are not settlements but belong on the map: a derelict, a hazard, a drift of
        wreckage.
      </p>
      {failure !== null && failure !== undefined && (
        <p className={styles.unavailable} role="alert">
          {failure.message}
        </p>
      )}
      {form.others.map((other) => {
        const at = (field: string) => fieldAnchorId(`sector.others.${other.draftId}.${field}`);
        return (
          <div key={other.draftId} className={styles.editor}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={at('name')}>
                Name
              </label>
              <input
                id={at('name')}
                className={styles.input}
                value={other.name}
                onChange={(event) =>
                  update((current) => setOther(current, other.draftId, 'name', event.target.value))
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={at('description')}>
                What it is
              </label>
              <textarea
                id={at('description')}
                className={styles.textarea}
                rows={2}
                value={other.description}
                onChange={(event) =>
                  update((current) =>
                    setOther(current, other.draftId, 'description', event.target.value),
                  )
                }
              />
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                disabled={save.isPending || toOtherRequest(other) === null}
                onClick={() => accept(other.draftId)}
              >
                {other.locationId === undefined ? 'Accept this location' : 'Save this revision'}
              </button>
              {other.locationId !== undefined && (
                <>
                  <label className={styles.subLabel} htmlFor={at('reason')}>
                    Why remove it?
                  </label>
                  <input
                    id={at('reason')}
                    className={styles.input}
                    value={reasons[other.draftId] ?? ''}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [other.draftId]: event.target.value }))
                    }
                  />
                </>
              )}
              <button
                type="button"
                className={styles.secondary}
                disabled={
                  other.locationId !== undefined && (reasons[other.draftId] ?? '').trim() === ''
                }
                onClick={() => drop(other.draftId, other.locationId)}
              >
                {other.locationId === undefined ? 'Discard' : 'Remove'}
              </button>
            </div>
          </div>
        );
      })}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={!configured}
          onClick={() => update((current) => addOther(current, crypto.randomUUID()))}
        >
          Add a location
        </button>
      </div>
    </section>
  );
}
