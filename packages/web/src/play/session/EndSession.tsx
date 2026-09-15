import { useEffect, useRef, useState } from 'react';

import type { EventId } from '@astrolabe/shared';

import { useCampaignState } from '../../api/campaigns.js';
import { ApiError } from '../../api/http.js';
import { useEndSession, useProposeSessionSummary } from '../../api/narration.js';
import { describeFailure } from '../narration/frames.js';

import {
  canCommit,
  committedThreads,
  isEdited,
  milestoneReminders,
  type SummaryDraft,
} from './end-session.js';
import styles from './EndSession.module.css';

interface Proposal extends SummaryDraft {
  readonly eventId: EventId;
}

/**
 * End a Session (9.4, A17, D-149), standing in for the composer once asked
 * for. The Guide proposes a summary and open threads; the player reviews
 * and may edit them, then commits. Ending waits on the proposal, so a failed
 * one leaves the session open with Retry, and Cancel goes back to play.
 */
export function EndSession({
  campaignId,
  onCancel,
}: {
  readonly campaignId: string;
  readonly onCancel: () => void;
}) {
  const propose = useProposeSessionSummary(campaignId);
  const end = useEndSession(campaignId);
  const reminders = useCampaignState(campaignId, milestoneReminders);
  const [proposal, setProposal] = useState<Proposal | undefined>();
  const [draft, setDraft] = useState<SummaryDraft>({ summary: '', openThreads: [] });
  const [failure, setFailure] = useState<string | undefined>();
  const asked = useRef(false);

  const ask = () => {
    setFailure(undefined);
    propose.mutate(undefined, {
      onSuccess: (response) => {
        if (response.ok) {
          const { eventId, summary, openThreads } = response;
          setProposal({ eventId, summary, openThreads });
          setDraft({ summary, openThreads });
        } else {
          setFailure(`${describeFailure(response.errorKind)} ${response.message}`);
        }
      },
      onError: (error) =>
        setFailure(
          error instanceof ApiError
            ? ((error.body as { problem?: string } | undefined)?.problem ??
                'The Guide could not be asked.')
            : 'The Guide could not be asked.',
        ),
    });
  };

  useEffect(() => {
    if (!asked.current) {
      asked.current = true;
      ask();
    }
    // Ask once, when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    if (proposal === undefined) {
      return;
    }
    end.mutate(
      {
        proposalEventId: proposal.eventId,
        summary: draft.summary.trim(),
        openThreads: [...committedThreads(draft)],
      },
      // Close the panel, so the next session opens on play rather than on it.
      { onSuccess: onCancel },
    );
  };

  const setThread = (index: number, text: string) =>
    setDraft((d) => ({ ...d, openThreads: d.openThreads.map((t, i) => (i === index ? text : t)) }));

  return (
    <div className={styles.end}>
      <div className={styles.header}>
        <span className={styles.title}>End the session</span>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {proposal === undefined && failure === undefined && (
        <span className={styles.hint}>The Guide is writing the session’s summary…</span>
      )}

      {failure !== undefined && (
        <div className={styles.failure} role="alert">
          <span>Guide unavailable — the session stays open. {failure}</span>
          <button
            type="button"
            className={styles.primary}
            onClick={ask}
            disabled={propose.isPending}
          >
            {propose.isPending ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {proposal !== undefined && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>
              Summary <span className={styles.badge}>Guide</span>
            </span>
            <textarea
              className={styles.summary}
              value={draft.summary}
              onChange={(event) => setDraft((d) => ({ ...d, summary: event.target.value }))}
            />
          </label>
          <fieldset className={styles.threads}>
            <legend className={styles.label}>Open threads</legend>
            {draft.openThreads.map((thread, i) => (
              <div key={i} className={styles.thread}>
                <input
                  className={styles.input}
                  value={thread}
                  aria-label={`Open thread ${i + 1}`}
                  onChange={(event) => setThread(i, event.target.value)}
                />
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      openThreads: d.openThreads.filter((_, j) => j !== i),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setDraft((d) => ({ ...d, openThreads: [...d.openThreads, ''] }))}
            >
              Add a thread
            </button>
          </fieldset>

          {(reminders.data ?? []).map((vow) => (
            <p key={vow.trackId} className={styles.reminder}>
              Reach a Milestone is available for “{vow.title}” if you judge one was earned.
            </p>
          ))}

          <div className={styles.actions}>
            {isEdited(draft, proposal) && (
              <span className={styles.hint}>Edited: the record will be yours.</span>
            )}
            {end.error !== null && (
              <span className={styles.error} role="alert">
                {end.error instanceof ApiError
                  ? ((end.error.body as { problem?: string } | undefined)?.problem ??
                    'The session could not end.')
                  : 'The session could not end.'}
              </span>
            )}
            <button
              type="button"
              className={styles.primary}
              disabled={!canCommit(draft) || end.isPending}
              onClick={commit}
            >
              {end.isPending ? 'Ending…' : 'End session'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
