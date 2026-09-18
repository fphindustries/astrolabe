import { useState } from 'react';

import { CHALLENGE_RANKS, STARFORGED, STAT_IDS, type AssetId, type StatId } from '@astrolabe/rules';
import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import {
  useCreateLaunchCharacter,
  useProposeCrewMember,
  useReviseLaunchCharacter,
  useRollLaunchOracle,
} from '../api/crew.js';
import { useAiStatus } from '../api/narration.js';
import { useSaveLaunchDraft } from '../api/launch.js';
import { AssetPicker } from '../characters/AssetPicker.js';
import { ErrorSummary } from '../ui/ErrorSummary.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import { CrewProposalPanel, proposalFailureText } from './CrewProposalPanel.js';
import { launchErrorSummary } from './errors.js';
import {
  BACKSTORY_PROMPT_ORACLE,
  CREW_SLOTS,
  CREW_STEPS,
  MAX_HOOKS,
  STEP_LABELS,
  addHook,
  addPrompt,
  applyProposal,
  editedFields,
  emptyCrewMember,
  initialCrewForm,
  isCrewMemberComplete,
  isDirty,
  markAccepted,
  problemsByStep,
  removeHook,
  replaceMember,
  selectSlot,
  setBackstoryMode,
  setHook,
  setStat,
  setVow,
  stepAt,
  stepBadgeLabel,
  toAcceptRequest,
  toDraftSnapshot,
  type CrewMemberForm,
  type CrewProposal,
  type CrewProposalField,
  type CrewStep,
} from './crew-form.js';
import styles from './CrewSection.module.css';

const STAT_VALUES = [...new Set(Object.values(emptyCrewMember('x').stats))].sort((a, b) => b - a);

/**
 * Crew: one to six characters, built a step at a time (6.1, beats 3–5).
 *
 * A step flow over **one draft**, not a wizard: every step edits the same crew
 * member, the player can move between them freely, and **Save and continue**
 * works from any of them. Nothing here decides whether a character is legal —
 * `crew-form.ts` runs the rules' own validator, and the server runs it again
 * because it is authoritative (D-90).
 *
 * Accepting is what creates the character; a draft is durable and not canon
 * (D-161), so saving never clears the section's blockers. Group 4's rule
 * holds: status and blockers come from the server's readiness, verbatim.
 */
export function CrewSection({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  // Recomputed each render rather than frozen at mount, so "work you have not
  // saved" stops being true the moment it stops being true — group 5 found
  // that a baseline captured once said it forever, including after a save.
  const baseline = initialCrewForm(workspace.state);
  const [crew, setCrew] = useState<readonly CrewMemberForm[]>(baseline);
  const [openId, setOpenId] = useState<string | undefined>(() => baseline[0]?.draftId);
  const [step, setStep] = useState<CrewStep>('identity');
  const [saved, setSaved] = useState<string | undefined>(undefined);

  const [concept, setConcept] = useState('');
  const [held, setHeld] = useState<
    | {
        readonly draftId: string;
        readonly proposal: CrewProposal;
        readonly applied: readonly CrewProposalField[];
        readonly commandId: string;
        readonly prompts: readonly { readonly eventId: string; readonly text: string }[];
      }
    | undefined
  >(undefined);
  const [askFailure, setAskFailure] = useState<string | undefined>(undefined);

  const saveDraft = useSaveLaunchDraft<'crew'>(campaignId);
  const create = useCreateLaunchCharacter(campaignId);
  const revise = useReviseLaunchCharacter(campaignId);
  const rollPrompt = useRollLaunchOracle(campaignId);
  const propose = useProposeCrewMember(campaignId);
  const guide = useAiStatus();
  const failure = create.error ?? revise.error ?? saveDraft.error ?? rollPrompt.error;

  const open = crew.find((member) => member.draftId === openId);
  const unsaved = isDirty(crew, baseline);

  const edit = (member: CrewMemberForm) => {
    setSaved(undefined);
    setCrew((current) => replaceMember(current, member));
  };

  const addMember = () => {
    const member = emptyCrewMember(crypto.randomUUID());
    setSaved(undefined);
    setCrew((current) => [...current, member]);
    setOpenId(member.draftId);
    setStep('identity');
  };

  const handleSaveDraft = () => {
    saveDraft.mutate(
      { section: 'crew', snapshot: toDraftSnapshot(crew) },
      { onSuccess: () => setSaved('Saved as setup. This is not campaign canon yet.') },
    );
  };

  const handleAccept = () => {
    if (open === undefined) return;
    const request = toAcceptRequest(open);
    if (request === null) return;
    setSaved(undefined);
    const accepted = 'Accepted. This character is now part of the crew.';
    // Naming the proposal is what lets the server record whose answer this is
    // (D-185): it compares what it proposed to what arrived and decides.
    const fromProposal =
      held?.draftId === open.draftId && held.applied.length > 0
        ? { proposalCommandId: held.commandId }
        : {};
    if (open.characterId === undefined) {
      create.mutate(
        { ...request, ...fromProposal },
        {
          // The id has to come back into the form, or the roster keeps calling an
          // accepted character "not accepted" and a second Accept creates a
          // duplicate instead of revising. Found in the browser.
          onSuccess: (response) => {
            setCrew((current) => replaceMember(current, markAccepted(open, response.characterId)));
            setSaved(accepted);
          },
        },
      );
    } else {
      revise.mutate(
        { characterId: open.characterId, ...request },
        {
          onSuccess: () =>
            setSaved('Saved. The earlier version stays in this character’s history.'),
        },
      );
    }
  };

  return (
    <div className={styles.section}>
      {failure !== null && failure !== undefined && (
        <ErrorSummary takeFocus {...launchErrorSummary(failure)} />
      )}

      <CrewRoster
        crew={crew}
        openId={openId}
        onOpen={(draftId) => {
          setOpenId(draftId);
          setStep('identity');
        }}
        onAdd={addMember}
      />

      {open !== undefined && (
        <CrewProposalPanel
          concept={concept}
          onConcept={setConcept}
          proposal={held?.draftId === open.draftId ? held.proposal : undefined}
          chips={workspace.chips}
          applied={held?.draftId === open.draftId ? held.applied : []}
          edited={
            held?.draftId === open.draftId ? editedFields(open, held.proposal, held.applied) : []
          }
          failure={askFailure}
          pending={propose.isPending}
          aiAvailable={guide.data?.available === true}
          aiReason={
            guide.data?.lastFailure === undefined
              ? undefined
              : proposalFailureText(guide.data.lastFailure)
          }
          onAsk={(fields) => {
            const member = open;
            setAskFailure(undefined);
            propose.mutate(
              {
                targetId: member.characterId ?? member.draftId,
                concept,
                ...(fields === undefined ? {} : { fields: [...fields] }),
              },
              {
                onSuccess: (result) => {
                  if (!result.response.ok) {
                    setAskFailure(proposalFailureText(result.response));
                    setHeld(undefined);
                    return;
                  }
                  setHeld({
                    draftId: member.draftId,
                    commandId: result.commandId,
                    proposal: result.response.proposal,
                    applied: [],
                    prompts: result.response.rolls.map((roll) => ({
                      eventId: roll.eventId,
                      text: roll.rowText,
                    })),
                  });
                },
              },
            );
          }}
          onApply={(fields) => {
            if (held === undefined) return;
            edit(applyProposal(open, held.proposal, fields, held.prompts as never));
            setHeld({ ...held, applied: fields });
          }}
          onRestore={(field) => {
            if (held === undefined) return;
            edit(applyProposal(open, held.proposal, [field]));
          }}
          onDismiss={() => setHeld(undefined)}
        />
      )}

      {open === undefined ? (
        <p className={styles.empty}>
          No one yet. One complete character is the launch minimum; up to six can share the
          campaign.
        </p>
      ) : (
        <MemberEditor
          member={open}
          step={step}
          onStep={setStep}
          onChange={edit}
          onAccept={handleAccept}
          accepting={create.isPending || revise.isPending}
          rolling={rollPrompt.isPending}
          onRollPrompt={() => {
            const member = open;
            rollPrompt.mutate(BACKSTORY_PROMPT_ORACLE, {
              onSuccess: (result) =>
                edit(addPrompt(member, { eventId: result.eventId, text: result.text })),
            });
          }}
        />
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
        {unsaved
          ? 'You have work here that is not saved or accepted yet.'
          : 'Saving keeps your work without making it a campaign fact. Accepting a character is what completes this section.'}
      </p>
    </div>
  );
}

function CrewRoster({
  crew,
  openId,
  onOpen,
  onAdd,
}: {
  readonly crew: readonly CrewMemberForm[];
  readonly openId: string | undefined;
  readonly onOpen: (draftId: string) => void;
  readonly onAdd: () => void;
}) {
  const complete = crew.filter(isCrewMemberComplete).length;
  return (
    <div className={styles.roster}>
      <h3 className={styles.rosterHeading}>
        Crew — {complete} of {crew.length} complete
      </h3>
      <ul className={styles.rosterList}>
        {crew.map((member) => (
          <li key={member.draftId}>
            <button
              type="button"
              className={styles.rosterItem}
              aria-current={member.draftId === openId ? 'true' : undefined}
              onClick={() => onOpen(member.draftId)}
            >
              <span className={styles.rosterName}>{member.name.trim() || 'Unnamed'}</span>
              <span className={styles.rosterState}>
                {isCrewMemberComplete(member) ? 'Complete' : 'In progress'}
                {member.characterId === undefined ? ' · not accepted' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.add} disabled={crew.length >= 6} onClick={onAdd}>
        Add a character
      </button>
      <p className={styles.rosterNote}>
        One complete character is the launch minimum. Six is the most this campaign can hold.
      </p>
    </div>
  );
}

function MemberEditor({
  member,
  step,
  onStep,
  onChange,
  onAccept,
  accepting,
  rolling,
  onRollPrompt,
}: {
  readonly member: CrewMemberForm;
  readonly step: CrewStep;
  readonly onStep: (step: CrewStep) => void;
  readonly onChange: (member: CrewMemberForm) => void;
  readonly onAccept: () => void;
  readonly accepting: boolean;
  readonly rolling: boolean;
  readonly onRollPrompt: () => void;
}) {
  const byStep = problemsByStep(member);
  const complete = isCrewMemberComplete(member);
  const panelId = `crew-step-${member.draftId}`;

  return (
    <section
      className={styles.editor}
      aria-label={`Editing ${member.name.trim() || 'a character'}`}
    >
      <nav className={styles.steps} aria-label="Character steps">
        <ol className={styles.stepList}>
          {CREW_STEPS.map((candidate) => (
            <li key={candidate}>
              <button
                type="button"
                className={styles.step}
                aria-current={candidate === step ? 'step' : undefined}
                onClick={() => onStep(candidate)}
              >
                {STEP_LABELS[candidate]}
                {byStep[candidate].length > 0 && (
                  <span className={styles.stepBadge}>
                    <span aria-hidden="true">{byStep[candidate].length}</span>
                    <span className={styles.visuallyHidden}>
                      {stepBadgeLabel(byStep[candidate].length)}
                    </span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* A named region with a visible heading, so which step you are on is
          not carried by the tab's colour alone, and so a reader who moves into
          the panel is told where they landed rather than inferring it. */}
      <div className={styles.panel} role="group" aria-labelledby={panelId}>
        <h4 className={styles.panelHeading} id={panelId}>
          {STEP_LABELS[step]}
        </h4>
        {step === 'identity' && <IdentityStep member={member} onChange={onChange} />}
        {step === 'stats' && <StatsStep member={member} onChange={onChange} />}
        {step === 'assets' && <AssetsStep member={member} onChange={onChange} />}
        {step === 'background' && (
          <BackgroundStep
            member={member}
            onChange={onChange}
            rolling={rolling}
            onRollPrompt={onRollPrompt}
          />
        )}
        {step === 'review' && <ReviewStep member={member} problems={byStep} />}
      </div>

      <div className={styles.stepActions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={step === CREW_STEPS[0]}
          onClick={() => onStep(stepAt(step, -1))}
        >
          Back
        </button>
        {step === 'review' ? (
          <button
            type="button"
            className={styles.primary}
            disabled={!complete || accepting}
            onClick={onAccept}
          >
            {member.characterId === undefined ? 'Accept this character' : 'Save changes'}
          </button>
        ) : (
          <button type="button" className={styles.primary} onClick={() => onStep(stepAt(step, 1))}>
            Next
          </button>
        )}
      </div>
    </section>
  );
}

type StepProps = {
  readonly member: CrewMemberForm;
  readonly onChange: (member: CrewMemberForm) => void;
};

function IdentityStep({ member, onChange }: StepProps) {
  return (
    <div className={styles.fields}>
      <Field label="Name" id={fieldAnchorId(`${member.draftId}-name`)}>
        <input
          id={fieldAnchorId(`${member.draftId}-name`)}
          className={styles.input}
          value={member.name}
          onChange={(event) => onChange({ ...member, name: event.target.value })}
        />
      </Field>
      <Field label="Callsign" id={fieldAnchorId(`${member.draftId}-callsign`)}>
        <input
          id={fieldAnchorId(`${member.draftId}-callsign`)}
          className={styles.input}
          value={member.callsign}
          onChange={(event) => onChange({ ...member, callsign: event.target.value })}
        />
      </Field>
      <Field
        label="Pronouns"
        id={fieldAnchorId(`${member.draftId}-pronouns`)}
        help="Optional. Left blank, they are simply not recorded — never guessed for you."
      >
        <input
          id={fieldAnchorId(`${member.draftId}-pronouns`)}
          className={styles.input}
          value={member.pronouns}
          onChange={(event) => onChange({ ...member, pronouns: event.target.value })}
        />
      </Field>
    </div>
  );
}

function StatsStep({ member, onChange }: StepProps) {
  return (
    <div className={styles.fields}>
      <p className={styles.help}>
        Each stat takes one value from the starting array. Choosing a value swaps it with whichever
        stat holds it, so the array always stays legal.
      </p>
      <ul className={styles.stats}>
        {STAT_IDS.map((statId: StatId) => (
          <li key={statId} className={styles.stat}>
            <label className={styles.label} htmlFor={`stat-${member.draftId}-${statId}`}>
              {statId}
            </label>
            <select
              id={`stat-${member.draftId}-${statId}`}
              className={styles.select}
              value={member.stats[statId]}
              onChange={(event) => onChange(setStat(member, statId, Number(event.target.value)))}
            >
              {STAT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssetsStep({ member, onChange }: StepProps) {
  return (
    <div className={styles.fields}>
      <p className={styles.help}>
        Two paths, then one more of your choosing. The crew’s starship is shared and belongs to no
        one character.
      </p>
      {CREW_SLOTS.map((slot) => (
        <AssetPicker
          key={slot.id}
          slot={slot}
          ruleset={STARFORGED}
          selected={member.slotSelections[slot.id]}
          onChange={(assetId: AssetId | undefined) =>
            onChange(selectSlot(member, slot.id, assetId))
          }
        />
      ))}
    </div>
  );
}

function BackgroundStep({
  member,
  onChange,
  rolling,
  onRollPrompt,
}: StepProps & { readonly rolling: boolean; readonly onRollPrompt: () => void }) {
  const written = member.backstoryMode === 'written';
  return (
    <div className={styles.fields}>
      <Field label="Appearance" id={fieldAnchorId(`${member.draftId}-appearance`)}>
        <textarea
          id={fieldAnchorId(`${member.draftId}-appearance`)}
          className={styles.textarea}
          rows={2}
          value={member.appearance}
          onChange={(event) => onChange({ ...member, appearance: event.target.value })}
        />
      </Field>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Backstory</legend>
        <p className={styles.help}>
          Write it, or say plainly that it is for play to discover. Discovering it is a choice you
          have made, not a field you have left empty.
        </p>
        <label className={styles.choice}>
          <input
            type="radio"
            name={`backstory-${member.draftId}`}
            checked={written}
            onChange={() => onChange(setBackstoryMode(member, 'written'))}
          />
          <span>Write it now</span>
        </label>
        <label className={styles.choice}>
          <input
            type="radio"
            name={`backstory-${member.draftId}`}
            checked={!written}
            onChange={() => onChange(setBackstoryMode(member, 'discover_in_play'))}
          />
          <span>Discover it in play</span>
        </label>
        {written && (
          <textarea
            className={styles.textarea}
            rows={3}
            aria-label="Backstory"
            value={member.backstoryText}
            onChange={(event) => onChange({ ...member, backstoryText: event.target.value })}
          />
        )}

        <button
          type="button"
          className={styles.secondary}
          disabled={rolling}
          onClick={onRollPrompt}
        >
          Roll a backstory prompt
        </button>
        {member.prompts.length > 0 && (
          <div className={styles.prompts}>
            <h4 className={styles.label} id={`prompts-${member.draftId}`}>
              Rolled prompts
            </h4>
            <p className={styles.help}>
              Inspiration, not the backstory. Write it in your own words — these stay recorded as
              what you drew on.
            </p>
            <ul className={styles.promptList} aria-labelledby={`prompts-${member.draftId}`}>
              {member.prompts.map((prompt) => (
                <li key={prompt.eventId} className={styles.prompt}>
                  {prompt.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Background vow</legend>
        <p className={styles.help}>
          What this character has already sworn. It becomes their own vow track.
        </p>
        <input
          className={styles.input}
          aria-label="Background vow"
          value={member.vowTitle}
          onChange={(event) => onChange(setVow(member, { title: event.target.value }))}
        />
        <select
          className={styles.select}
          aria-label="Vow rank"
          value={member.vowRank}
          onChange={(event) =>
            onChange(setVow(member, { rank: event.target.value as CrewMemberForm['vowRank'] }))
          }
        >
          {CHALLENGE_RANKS.map((rank) => (
            <option key={rank} value={rank}>
              {rank}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Hooks</legend>
        {member.hooks.map((hook, index) => (
          <div key={index} className={styles.hook}>
            <input
              className={styles.input}
              aria-label={`Hook ${index + 1}`}
              value={hook}
              onChange={(event) => onChange(setHook(member, index, event.target.value))}
            />
            <button
              type="button"
              className={styles.secondary}
              onClick={() => onChange(removeHook(member, index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.secondary}
          disabled={member.hooks.length >= MAX_HOOKS}
          onClick={() => onChange(addHook(member))}
        >
          Add a hook
        </button>
      </fieldset>

      <Field
        label="Signature gear"
        id={fieldAnchorId(`${member.draftId}-gear`)}
        help="Optional. A note about something they carry."
      >
        <input
          id={fieldAnchorId(`${member.draftId}-gear`)}
          className={styles.input}
          value={member.signatureGear}
          onChange={(event) => onChange({ ...member, signatureGear: event.target.value })}
        />
      </Field>
    </div>
  );
}

function ReviewStep({
  member,
  problems,
}: {
  readonly member: CrewMemberForm;
  readonly problems: ReturnType<typeof problemsByStep>;
}) {
  const outstanding = CREW_STEPS.flatMap((step) => problems[step]);
  return (
    <div className={styles.fields}>
      {outstanding.length > 0 ? (
        <ErrorSummary
          title="This character is not complete yet."
          problems={outstanding.map((problem) => ({
            path: `${member.draftId}-${problem.field}`,
            message: problem.message,
          }))}
        />
      ) : (
        <p className={styles.help}>
          Everything the rules ask for is here. Accepting writes the character and their background
          vow as one act.
        </p>
      )}
      <dl className={styles.summary}>
        <Summary label="Name">{member.name || '—'}</Summary>
        <Summary label="Callsign">{member.callsign || '—'}</Summary>
        <Summary label="Pronouns">{member.pronouns || 'not recorded'}</Summary>
        <Summary label="Backstory">
          {member.backstoryMode === 'written' ? member.backstoryText || '—' : 'Discover in play'}
        </Summary>
        <Summary label="Background vow">
          {member.vowTitle || '—'} ({member.vowRank})
        </Summary>
      </dl>
    </div>
  );
}

function Summary({ label, children }: { readonly label: string; readonly children: unknown }) {
  return (
    <>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.summaryValue}>{children as never}</dd>
    </>
  );
}

function Field({
  label,
  id,
  help,
  children,
}: {
  readonly label: string;
  readonly id: string;
  readonly help?: string;
  readonly children: unknown;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {help !== undefined && <p className={styles.help}>{help}</p>}
      {children as never}
    </div>
  );
}
