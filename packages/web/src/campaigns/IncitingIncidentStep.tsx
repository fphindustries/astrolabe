import { useState, type FormEvent } from 'react';

import { STARFORGED } from '@astrolabe/rules';
import { ChallengeRankSchema, type ChallengeRank, type ProposalRoll } from '@astrolabe/shared';

import { useCampaignState } from '../api/campaigns.js';
import { useProposeIncidents, useSwearIncitingVow } from '../api/campaign-setup.js';
import { useAiStatus } from '../api/narration.js';
import { navigate } from '../app/location.js';
import { rollChip } from '../characters/proposal.js';
import { describeFailure } from '../play/narration/frames.js';

import {
  drawsOnLabels,
  holdsOption,
  optionRolls,
  wouldReplaceWriting,
  type IncidentOption,
  type VowForm,
} from './incident-proposal.js';
import styles from './IncitingIncidentStep.module.css';

interface HeldProposal {
  readonly commandId: string;
  readonly options: readonly IncidentOption[];
  readonly rolls: readonly ProposalRoll[];
}

/**
 * The inciting incident becomes the first vow (task 4.4, D-34). The player
 * writes it, or starts from one of the Guide's proposed incidents (4.6,
 * D-132) and edits it as they like; writing their own stays as prominent
 * as asking, and asking is never required. The proposals draw on whatever
 * crew exists, and the step says when there is none (D-133). Finishing
 * this step ends campaign setup and hands off to the play screen, which is
 * the campaign's home (D-100).
 */
export function IncitingIncidentStep({ campaignId }: { readonly campaignId: string }) {
  const [form, setForm] = useState<VowForm>({ title: '', rank: 'formidable' });
  const [held, setHeld] = useState<HeldProposal | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [confirmUse, setConfirmUse] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  const swearVow = useSwearIncitingVow(campaignId);
  const proposeIncidents = useProposeIncidents(campaignId);
  const guide = useAiStatus();
  const state = useCampaignState(campaignId);
  const crewCount =
    state.data === undefined ? undefined : Object.keys(state.data.characters).length;

  const usedOption = held === null || used === null ? undefined : held.options[used];
  const guideUnavailable = guide.data !== undefined && !guide.data.configured;

  const propose = () => {
    setFailure(undefined);
    setConfirmUse(null);
    proposeIncidents.mutate(undefined, {
      onSuccess: ({ commandId, response }) => {
        if (!response.ok) {
          setFailure(`${describeFailure(response.errorKind)} ${response.message}`);
          return;
        }
        // The form is untouched: a new proposal replaces the cards, never the player's words.
        setHeld({ commandId, options: response.proposal.options, rolls: response.rolls });
        setUsed(null);
      },
      onError: () => setFailure('The Guide could not be asked. Check the server.'),
    });
  };

  const fillFrom = (index: number) => {
    const option = held?.options[index];
    if (option === undefined) return;
    setForm({ title: option.title, rank: option.rank });
    setUsed(index);
    setConfirmUse(null);
  };

  const requestFill = (index: number) => {
    if (wouldReplaceWriting(form, usedOption)) {
      setConfirmUse(index);
      return;
    }
    fillFrom(index);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (form.title.trim().length === 0) return;
    swearVow.mutate(
      {
        title: form.title,
        rank: form.rank,
        ...(held !== null && usedOption !== undefined ? { proposalCommandId: held.commandId } : {}),
      },
      { onSuccess: () => navigate(`/campaigns/${campaignId}`) },
    );
  };

  return (
    <div className={styles.step}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Ask the Guide</h2>
        <p className={styles.hint}>
          The Guide proposes three incidents, each grounded in an oracle roll and drawn from your
          truths and sector{crewCount === 0 ? '' : ' and your crew’s backgrounds'}. Use one as it
          is, change it, or ignore them and write your own below.
        </p>
        {crewCount === 0 && (
          <p className={styles.hint}>
            No characters have been created for this campaign yet, so the proposals can’t draw on
            anyone’s background.
          </p>
        )}
        <div className={styles.proposeRow}>
          <button
            type="button"
            className={styles.secondary}
            disabled={proposeIncidents.isPending || guideUnavailable}
            onClick={propose}
          >
            {held === null ? 'Propose incidents' : 'Propose again'}
          </button>
          {proposeIncidents.isPending && (
            <span className={styles.hint}>The Guide is drafting incidents…</span>
          )}
          {guideUnavailable && (
            <span className={styles.hint}>The Guide is not configured; write your own.</span>
          )}
        </div>
        {failure !== undefined && <p className={styles.formError}>{failure}</p>}

        {held !== null && (
          <ol className={styles.options} aria-label="Proposed incidents">
            {held.options.map((option, index) => (
              <li key={index} className={styles.option} data-used={used === index || undefined}>
                <div className={styles.optionHead}>
                  <span className={styles.optionTitle}>{option.title}</span>
                  <span className={styles.rank}>{option.rank}</span>
                </div>
                <p className={styles.situation}>{option.situation}</p>
                <div className={styles.guideNote}>
                  <span className={styles.badge}>Guide</span>
                  <div className={styles.guideLines}>
                    <span>{option.reason}</span>
                    {state.data !== undefined && (
                      <DrawsOn labels={drawsOnLabels(option, state.data, STARFORGED.truths)} />
                    )}
                    <ul className={styles.chips} aria-label="Oracle rolls">
                      {optionRolls(option, held.rolls).map((roll) => (
                        <li key={roll.eventId} className={styles.chip}>
                          {rollChip(roll)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {confirmUse === index ? (
                  <div className={styles.confirm}>
                    <span>Replace what you wrote with this incident?</span>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => fillFrom(index)}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setConfirmUse(null)}
                    >
                      Keep mine
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => requestFill(index)}
                  >
                    {used === index ? 'Use this again' : 'Use this'}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <form className={styles.section} onSubmit={handleSubmit}>
        <h2 className={styles.sectionTitle}>The first vow</h2>
        <textarea
          className={styles.textarea}
          aria-label="Inciting incident"
          placeholder="What set this crew on their way?"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <select
          className={styles.select}
          aria-label="Challenge rank"
          value={form.rank}
          onChange={(event) => setForm({ ...form, rank: event.target.value as ChallengeRank })}
        >
          {ChallengeRankSchema.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {usedOption !== undefined && used !== null && (
          <div
            className={styles.guideNote}
            data-edited={!holdsOption(form, usedOption) || undefined}
          >
            <span className={styles.badge}>
              {holdsOption(form, usedOption) ? 'Guide' : 'Edited'}
            </span>
            {holdsOption(form, usedOption) ? (
              <span>Proposed incident {used + 1}, as the Guide wrote it.</span>
            ) : (
              <button type="button" className={styles.linkButton} onClick={() => fillFrom(used)}>
                Restore proposed incident {used + 1}
              </button>
            )}
          </div>
        )}
        <button
          type="submit"
          className={styles.submit}
          disabled={form.title.trim().length === 0 || swearVow.isPending}
        >
          Swear this vow and start playing
        </button>
      </form>
    </div>
  );
}

function DrawsOn({ labels }: { readonly labels: readonly string[] }) {
  return labels.length === 0 ? null : <span>Draws on: {labels.join(', ')}</span>;
}
