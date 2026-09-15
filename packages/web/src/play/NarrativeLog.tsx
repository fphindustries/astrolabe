import { useEffect, useLayoutEffect, useRef } from 'react';

import { withoutLinks } from '@astrolabe/rules';

import { useCampaignLog } from '../api/campaigns.js';

import { CorrectionControl } from './log/CorrectionControl.js';
import {
  orderedBeats,
  toBeatView,
  withoutChippedRolls,
  type BeatView,
  type EntryView,
} from './log/entries.js';
import { VoidControl } from './log/VoidControl.js';
import { TriggerNote } from './moves/TriggerNote.js';
import { OracleChips } from './oracle/OracleChips.js';
import { useNarrationStream } from './narration/narration-stream.js';
import type { PendingPassage } from './narration/frames.js';
import styles from './NarrativeLog.module.css';

/**
 * The narrative log (task 5.4). `PlayLayout`'s `.log` div is the shell's one
 * scrolling region (D-40) and is the parent this component renders into —
 * not a scroll container of its own — so the anchor ref below reaches up to
 * that ancestor to read and restore scroll position.
 */
export function NarrativeLog({ campaignId }: { readonly campaignId: string }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCampaignLog(campaignId);
  const anchorRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef<number | null>(null);
  const scrolledToBottom = useRef(false);
  const { pending } = useNarrationStream();
  // A scene frame (D-141) and a recap (D-147) stream like a beat's passage.
  const pendingBeat =
    pending?.target.kind === 'beat' ||
    pending?.target.kind === 'scene_frame' ||
    pending?.target.kind === 'recap'
      ? pending
      : null;
  const pendingRevision = pending?.target.kind === 'revision' ? pending : null;
  const pendingWorld = pending?.target.kind === 'world' ? pending : null;

  const beats =
    data === undefined ? [] : withoutChippedRolls(orderedBeats(data.pages).map(toBeatView));
  const pageCount = data?.pages.length ?? 0;

  // Older pages prepend above the current view. Restore the offset by the
  // height they added so the viewport doesn't jump; on first load, land at
  // the bottom (the most recent beat) instead.
  useLayoutEffect(() => {
    const el = anchorRef.current?.parentElement ?? null;
    if (el === null) {
      return;
    }
    if (!scrolledToBottom.current) {
      if (beats.length > 0) {
        el.scrollTop = el.scrollHeight;
        scrolledToBottom.current = true;
      }
    } else if (prevScrollHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevScrollHeight.current;
    }
    prevScrollHeight.current = el.scrollHeight;
  }, [pageCount, beats.length]);

  // Streaming text grows the log from the bottom — the opposite of paging.
  // Follow it only if the reader was already at (or near) the bottom.
  const pendingLength = pending?.text.length ?? -1;
  useLayoutEffect(() => {
    const el = anchorRef.current?.parentElement ?? null;
    if (el === null || pendingLength < 0 || prevScrollHeight.current === null) {
      return;
    }
    const wasNearBottom = prevScrollHeight.current - (el.scrollTop + el.clientHeight) < 80;
    if (wasNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
    prevScrollHeight.current = el.scrollHeight;
  }, [pendingLength]);

  useEffect(() => {
    const el = anchorRef.current?.parentElement ?? null;
    if (el === null) {
      return;
    }
    const onScroll = () => {
      if (el.scrollTop < 200 && hasNextPage === true && !isFetchingNextPage) {
        void fetchNextPage();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) {
    return <div className={styles.empty}>Loading the log…</div>;
  }

  return (
    <div ref={anchorRef} className={styles.entries}>
      {beats.length === 0 && pendingBeat === null ? (
        <div className={styles.empty}>Nothing has happened yet.</div>
      ) : (
        beats.map((beat) => (
          <Beat
            key={beat.commandId}
            campaignId={campaignId}
            beat={beat}
            pendingRevision={pendingRevision}
          />
        ))
      )}
      {pendingBeat !== null && (
        <div className={styles.beat}>
          <PendingText passage={pendingBeat} />
        </div>
      )}
      {pendingWorld !== null &&
        (pendingWorld.status === 'waiting' && pendingWorld.withdrawn.length === 0 ? (
          <div className={styles.pendingLabel} role="status">
            The Guide is considering whether the world holds anything new…
          </div>
        ) : (
          // What the world pass established, narrated (8.2).
          <div className={styles.beat}>
            <PendingText passage={pendingWorld} />
          </div>
        ))}
    </div>
  );
}

function Beat({
  campaignId,
  beat,
  pendingRevision,
}: {
  readonly campaignId: string;
  readonly beat: BeatView;
  readonly pendingRevision: PendingPassage | null;
}) {
  return (
    <div className={styles.beat} data-voided={beat.voided}>
      {beat.entries.map((entry) =>
        pendingRevision?.target.kind === 'revision' &&
        pendingRevision.target.targetEventId === entry.eventId ? (
          <PendingText key={entry.eventId} passage={pendingRevision} />
        ) : (
          <Entry key={entry.eventId} campaignId={campaignId} entry={entry} />
        ),
      )}
    </div>
  );
}

const PENDING_LABELS: Readonly<Record<PendingPassage['status'], string>> = {
  waiting: 'The Guide is writing…',
  streaming: 'The Guide is writing — not yet checked',
  checking: 'Checking the passage before it is kept…',
  retrying: 'The Guide is trying again…',
};

/**
 * A passage on its way (D-128): shown while written, but provisional until
 * it is checked and kept. A withdrawn attempt stays on screen, struck, with
 * its reason — it is never swapped out silently.
 */
function PendingText({ passage }: { readonly passage: PendingPassage }) {
  return (
    <div className={styles.entry} aria-live="polite" aria-busy="true">
      {passage.withdrawn.map((withdrawn, index) => (
        <Withdrawn key={index} reason={withdrawn.reason} rejectedText={withdrawn.text} />
      ))}
      <span className={styles.pendingLabel}>{PENDING_LABELS[passage.status]}</span>
      {passage.text.length > 0 && (
        <span className={`${styles.text} ${styles.provisional}`}>{passage.text}</span>
      )}
    </div>
  );
}

function Withdrawn({
  reason,
  rejectedText,
  quotes = [],
}: {
  readonly reason: string;
  readonly rejectedText: string;
  readonly quotes?: readonly string[];
}) {
  return (
    <div className={styles.withdrawal} role="note">
      <span className={styles.withdrawalReason}>{reason}</span>
      {quotes.map((quote, index) => (
        <q key={index} className={styles.withdrawalQuote}>
          {quote}
        </q>
      ))}
      <details>
        <summary>Show what was withdrawn</summary>
        <p className={styles.struck}>{rejectedText}</p>
      </details>
    </div>
  );
}

function Entry({ campaignId, entry }: { readonly campaignId: string; readonly entry: EntryView }) {
  const body = entry.body;
  if (body.kind === 'trigger_note') {
    // D-136: a remark on its move, with no controls of its own: voiding the move takes it along.
    return (
      <div className={styles.entry} data-voided={entry.voided}>
        <TriggerNote note={body} />
      </div>
    );
  }
  if (body.kind === 'complication_offered') {
    // D-143: the options as offered, each with its Action + Theme chips.
    return (
      <div className={styles.entry} data-voided={entry.voided}>
        <span className={styles.text}>The Guide offers complications:</span>
        <ol className={styles.offered}>
          {body.options.map((option, index) => (
            <li key={index}>
              <span className={styles.text}>{option.text}</span>
              <OracleChips chips={option.chips} />
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (body.kind === 'withdrawal') {
    // A record of what was refused, not a thing to correct or void on its
    // own: voiding its beat takes it with the rest (D-128).
    return (
      <div className={styles.entry} data-voided={entry.voided}>
        <Withdrawn reason={body.reason} rejectedText={body.rejectedText} quotes={body.quotes} />
      </div>
    );
  }
  return (
    <div className={styles.entry} data-voided={entry.voided}>
      <span className={styles.text}>{describeEntry(entry)}</span>
      {body.kind === 'narration' && body.chips.length > 0 && <OracleChips chips={body.chips} />}
      {body.kind === 'narration' && !entry.voided && <CorrectionControl eventId={entry.eventId} />}
      {/* A11/D-27: only a live, voidable event offers this — an already-voided one is history, not undone twice. */}
      {entry.voidable && !entry.voided && (
        <VoidControl campaignId={campaignId} eventId={entry.eventId} />
      )}
      {body.kind === 'narration' && body.corrected && (
        <details className={styles.correction}>
          <summary>Corrected</summary>
          {body.original !== undefined && <p>Originally: {body.original}</p>}
          {body.note !== undefined && <p>Why: {body.note}</p>}
        </details>
      )}
      {entry.voidMarks.map((mark, index) => (
        <span key={index} className={styles.voidReason}>
          {mark.kind === 'reroll' ? 'Rerolled' : 'Voided'}: {mark.reason}
        </span>
      ))}
    </div>
  );
}

function describeEntry(entry: EntryView): string {
  const body = entry.body;
  switch (body.kind) {
    case 'scene':
      return `Scene: ${body.title}`;
    case 'move':
      return (
        `Move: ${body.moveId}${body.aiding ? ' (aiding an ally)' : ''}` +
        (body.actionText === undefined ? '' : ` — ${body.actionText}`)
      );
    case 'roll':
      return (
        `Roll: ${body.tier.replace('_', ' ')}${body.isMatch ? ' (match)' : ''}` +
        (body.burnOffered ? (body.burnTaken ? ' — burned momentum' : ' — burn offered') : '')
      );
    case 'burn':
      return `Momentum burned: ${body.tierBefore.replace('_', ' ')} → ${body.tierAfter.replace('_', ' ')}`;
    case 'move_choice_made':
      return `Choice: ${body.choiceId}${body.optionIds.length === 0 ? ' (declined)' : ` — ${body.optionIds.join(', ')}`}`;
    case 'move_method_chosen':
      return `Method: ${body.optionId}`;
    case 'move_chained':
      return `Chains to ${body.toMoveId} (${body.mode}) — ${body.reason}`;
    case 'oracle_rolled':
      return `Oracle: ${body.roll} — ${withoutLinks(body.rowText)}`;
    case 'amount_proposed':
      return `Guide proposes ${body.amount >= 0 ? '+' : ''}${body.amount} ${body.meter} — ${body.injury === undefined ? body.reason : `${body.injury} (${body.reason})`}`;
    case 'amount_committed':
      return `Committed ${body.amount >= 0 ? '+' : ''}${body.amount} ${body.meter}`;
    case 'track_created':
      return `Track created: ${body.title}`;
    case 'complication_offered':
      return `The Guide offers complications: ${body.options.map((o, i) => `(${i + 1}) ${o.text}`).join(' ')}`;
    case 'complication_set':
      return `Complication (${
        body.source === 'offered'
          ? 'picked from the Guide’s options'
          : body.fromOffer
            ? 'edited from the Guide’s option'
            : 'written by the player'
      }): ${body.text}`;
    case 'track_advanced':
      return `Track advanced by ${body.ticks}${body.reason === undefined ? '' : ` — ${body.reason}`}`;
    case 'entity_established':
      return `Entity established: ${body.name}`;
    case 'narration':
      return body.text;
    case 'withdrawal':
      return body.reason;
    case 'trigger_note':
      return `The Guide notes the trigger may not fit: ${body.reason}`;
    case 'override':
      return `Override: ${body.from} → ${body.to}${body.reason === undefined ? '' : ` (${body.reason})`}`;
    case 'void':
      return `Voided ${body.cascadedCount} event${body.cascadedCount === 1 ? '' : 's'}: ${body.reason}`;
    case 'session_ended':
      return `Session ended: ${body.summary}`;
    case 'unknown':
      return body.type;
  }
}
