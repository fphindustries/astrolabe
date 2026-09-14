import { useState, type FormEvent, type ReactNode } from 'react';

import {
  STARFORGED,
  STAT_IDS,
  grantedAssets,
  validateCharacterDraft,
  type AssetId,
  type CharacterDraft,
  type StatId,
} from '@astrolabe/rules';
import { ChallengeRankSchema, type ChallengeRank, type ProposalRoll } from '@astrolabe/shared';

import { useCampaignState } from '../api/campaigns.js';
import { useCreateCharacter, useProposeCharacter } from '../api/characters.js';
import { ApiError } from '../api/http.js';
import { useAiStatus } from '../api/narration.js';
import { navigate } from '../app/location.js';
import { describeFailure } from '../play/narration/frames.js';
import { formatTokens, totalTokens } from '../play/tokens.js';

import {
  CREATION_SLOTS,
  assignStat,
  emptyDraft,
  grantedAssetViews,
  problemsByField,
} from './creation-form.js';
import { AssetPicker } from './AssetPicker.js';
import {
  MAX_HOOKS,
  PROPOSED_FIELDS,
  applyProposal,
  guideNotes,
  hooksToSend,
  rollChip,
  type CharacterProposal,
  type CreationForm,
  type ProposedField,
} from './proposal.js';
import styles from './CharacterCreationScreen.module.css';

const GRANTED = grantedAssetViews(STARFORGED, grantedAssets(STARFORGED));

const EMPTY_FORM: CreationForm = {
  name: '',
  callsign: '',
  stats: emptyDraft().stats,
  slotSelections: {},
  swearVow: false,
  vowTitle: '',
  vowRank: 'troublesome',
  hooks: [],
};

interface HeldProposal {
  readonly commandId: string;
  readonly proposal: CharacterProposal;
  readonly rolls: readonly ProposalRoll[];
}

/**
 * `/campaigns/:id/characters/new` (task 3.2, D-100 — a full page, not a
 * drawer). Every field is directly editable and validated against
 * `validateCharacterDraft` as it changes (D-90) — this screen never
 * recounts slots or stats itself.
 *
 * Concept-first (3.3, D-124) fills the same fields from the Guide's
 * proposal rather than replacing the form. A field still holding the
 * Guide's value shows why; once edited it says so and can be restored.
 * Nothing is written until the player creates the character, and the form
 * stays usable while a proposal is on its way.
 *
 * No `grantCommandVehicle` toggle: manual and concept-first creation both
 * always grant the starship (D-124).
 */
export function CharacterCreationScreen({ campaignId }: { readonly campaignId: string }) {
  const [form, setForm] = useState<CreationForm>(EMPTY_FORM);
  const [concept, setConcept] = useState('');
  const [held, setHeld] = useState<HeldProposal | null>(null);
  const [edited, setEdited] = useState<ReadonlySet<ProposedField>>(new Set());
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [proposalFailure, setProposalFailure] = useState<string | undefined>(undefined);

  const createCharacter = useCreateCharacter(campaignId);
  const proposeCharacter = useProposeCharacter(campaignId);
  const guide = useAiStatus();
  const campaignTokens = useCampaignState(campaignId, (state) => state.tokenUsage);

  const draft: CharacterDraft = {
    name: form.name,
    callsign: form.callsign,
    stats: form.stats,
    assets: CREATION_SLOTS.map((slot) => form.slotSelections[slot.id]).filter(
      (assetId): assetId is AssetId => assetId !== undefined,
    ),
  };
  const problems = validateCharacterDraft(draft, STARFORGED);
  const fieldProblems = problemsByField(problems);
  const canSubmit = problems.length === 0 && !createCharacter.isPending;
  const notes = held === null ? undefined : guideNotes(held.proposal, held.rolls, STARFORGED);

  /** Apply a player edit, and mark the field as no longer the Guide's. */
  const edit = (field: ProposedField, patch: Partial<CreationForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    if (held !== null && !edited.has(field)) {
      setEdited(new Set([...edited, field]));
    }
  };

  const restore = (field: ProposedField) => {
    if (held === null) {
      return;
    }
    setForm((current) =>
      applyProposal(current, held.proposal, [field], CREATION_SLOTS, STARFORGED),
    );
    setEdited(new Set([...edited].filter((f) => f !== field)));
  };

  const propose = () => {
    setConfirmReplace(false);
    setProposalFailure(undefined);
    proposeCharacter.mutate(concept, {
      onSuccess: ({ commandId, response }) => {
        if (!response.ok) {
          setProposalFailure(`${describeFailure(response.errorKind)} ${response.message}`);
          return;
        }
        setHeld({ commandId, proposal: response.proposal, rolls: response.rolls });
        setForm((current) =>
          applyProposal(current, response.proposal, PROPOSED_FIELDS, CREATION_SLOTS, STARFORGED),
        );
        setEdited(new Set());
      },
      onError: () => setProposalFailure('The Guide could not be asked. Check the server.'),
    });
  };

  const requestProposal = () => {
    if (held !== null && edited.size > 0) {
      setConfirmReplace(true);
      return;
    }
    propose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    createCharacter.mutate(
      {
        draft,
        ...(form.swearVow ? { backgroundVow: { title: form.vowTitle, rank: form.vowRank } } : {}),
        hooks: hooksToSend(form.hooks),
        ...(held !== null ? { proposalCommandId: held.commandId } : {}),
      },
      { onSuccess: () => navigate(`/campaigns/${campaignId}`) },
    );
  };

  const guideUnavailable = guide.data !== undefined && !guide.data.configured;
  const note = (field: ProposedField): ReactNode =>
    notes === undefined ? null : (
      <GuideMarker
        note={notes[field]}
        edited={edited.has(field)}
        onRestore={() => restore(field)}
      />
    );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>New character</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Describe your character</h2>
          <p className={styles.hint}>
            A sentence or two is enough. The Guide proposes a full build from it, grounded in oracle
            rolls; every field below stays yours to change. Or skip this and build by hand.
          </p>
          <textarea
            className={styles.textarea}
            aria-label="Character concept"
            rows={3}
            value={concept}
            onChange={(event) => setConcept(event.target.value)}
          />
          {confirmReplace ? (
            <div className={styles.confirm}>
              <span>Replace your edits with a new proposal?</span>
              <button type="button" className={styles.secondary} onClick={propose}>
                Replace
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setConfirmReplace(false)}
              >
                Keep my edits
              </button>
            </div>
          ) : (
            <div className={styles.proposeRow}>
              <button
                type="button"
                className={styles.secondary}
                disabled={concept.trim() === '' || proposeCharacter.isPending || guideUnavailable}
                onClick={requestProposal}
              >
                {held === null ? 'Propose a build' : 'Propose again'}
              </button>
              {proposeCharacter.isPending && (
                <span className={styles.hint}>The Guide is drafting a build…</span>
              )}
              {guideUnavailable && (
                <span className={styles.hint}>The Guide is not configured; build by hand.</span>
              )}
              {campaignTokens.data !== undefined && totalTokens(campaignTokens.data) > 0 && (
                <span className={styles.tokens}>
                  {formatTokens(campaignTokens.data)} tokens this campaign
                </span>
              )}
            </div>
          )}
          {proposalFailure !== undefined && <p className={styles.formError}>{proposalFailure}</p>}
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className={styles.input}
            value={form.name}
            onChange={(event) => edit('name', { name: event.target.value })}
          />
          {note('name')}
          <FieldErrors messages={fieldProblems.name} />

          <label className={styles.label} htmlFor="callsign">
            Callsign
          </label>
          <input
            id="callsign"
            className={styles.input}
            value={form.callsign}
            onChange={(event) => edit('callsign', { callsign: event.target.value })}
          />
          {note('callsign')}
          <FieldErrors messages={fieldProblems.callsign} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Stats</h2>
          <div className={styles.statRow}>
            {STAT_IDS.map((statId: StatId) => (
              <label key={statId} className={styles.stat}>
                <span className={styles.statLabel}>{statId}</span>
                <select
                  className={styles.select}
                  value={form.stats[statId]}
                  onChange={(event) =>
                    edit('stats', {
                      stats: assignStat(form.stats, statId, Number(event.target.value)),
                    })
                  }
                >
                  {[1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {note('stats')}
          <FieldErrors messages={fieldProblems.stats} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Assets</h2>
          {CREATION_SLOTS.map((slot) => (
            <AssetPicker
              key={slot.id}
              slot={slot}
              ruleset={STARFORGED}
              selected={form.slotSelections[slot.id]}
              onChange={(assetId) =>
                edit('assets', { slotSelections: { ...form.slotSelections, [slot.id]: assetId } })
              }
            />
          ))}
          <div className={styles.granted}>
            <span className={styles.label}>Granted</span>
            <ul className={styles.grantedList}>
              {GRANTED.map((asset) => (
                <li key={asset.id}>{asset.name}</li>
              ))}
            </ul>
          </div>
          {note('assets')}
          <FieldErrors messages={fieldProblems.assets} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Background vow</h2>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.swearVow}
              onChange={(event) => edit('vow', { swearVow: event.target.checked })}
            />
            Swear a background vow now
          </label>
          {form.swearVow && (
            <div className={styles.vowFields}>
              <input
                className={styles.input}
                placeholder="Vow title"
                value={form.vowTitle}
                onChange={(event) => edit('vow', { vowTitle: event.target.value })}
              />
              <select
                className={styles.select}
                value={form.vowRank}
                onChange={(event) => edit('vow', { vowRank: event.target.value as ChallengeRank })}
              >
                {ChallengeRankSchema.options.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>
          )}
          {note('vow')}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Backstory hooks</h2>
          {form.hooks.map((hook, index) => (
            <div key={index} className={styles.hookRow}>
              <input
                className={styles.input}
                aria-label={`Hook ${index + 1}`}
                value={hook}
                onChange={(event) =>
                  edit('hooks', {
                    hooks: form.hooks.map((h, i) => (i === index ? event.target.value : h)),
                  })
                }
              />
              <button
                type="button"
                className={styles.secondary}
                onClick={() => edit('hooks', { hooks: form.hooks.filter((_, i) => i !== index) })}
              >
                Remove
              </button>
            </div>
          ))}
          {form.hooks.length < MAX_HOOKS && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => edit('hooks', { hooks: [...form.hooks, ''] })}
            >
              Add a hook
            </button>
          )}
          {note('hooks')}
        </section>

        {createCharacter.isError && (
          <p className={styles.formError}>{describeError(createCharacter.error)}</p>
        )}

        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          Create character
        </button>
      </form>
    </div>
  );
}

/** The "Guide" marker under a proposed field: why, and from which rolls — or that it was edited. */
function GuideMarker({
  note,
  edited,
  onRestore,
}: {
  readonly note: { readonly lines: readonly string[]; readonly rolls: readonly ProposalRoll[] };
  readonly edited: boolean;
  readonly onRestore: () => void;
}) {
  if (edited) {
    return (
      <div className={styles.guideNote} data-edited="true">
        <span className={styles.badge}>Edited</span>
        <button type="button" className={styles.linkButton} onClick={onRestore}>
          Restore the Guide’s value
        </button>
      </div>
    );
  }
  return (
    <div className={styles.guideNote}>
      <span className={styles.badge}>Guide</span>
      <div className={styles.guideLines}>
        {note.lines.map((line, index) => (
          <span key={index}>{line}</span>
        ))}
        {note.rolls.length > 0 && (
          <ul className={styles.chips} aria-label="Oracle rolls">
            {note.rolls.map((roll) => (
              <li key={roll.eventId} className={styles.chip}>
                {rollChip(roll)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FieldErrors({ messages }: { readonly messages: readonly string[] | undefined }) {
  if (messages === undefined || messages.length === 0) {
    return null;
  }
  return (
    <ul className={styles.errors}>
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) {
    return 'The server rejected this draft — reload and try again.';
  }
  return "Couldn't create the character. Check the server and try again.";
}
