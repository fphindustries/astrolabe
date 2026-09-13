import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useInvalidateCampaign } from '../../api/campaigns.js';
import { ApiError } from '../../api/http.js';
import {
  aiKeys,
  correctNarrationPath,
  narrateBeatPath,
  streamNarration,
  useAiStatus,
} from '../../api/narration.js';

import {
  applyFrame,
  closeWithoutFrame,
  describeFailure,
  startPassage,
  type NarrationFailure,
  type NarrationTarget,
  type PendingPassage,
  type StreamOutcome,
} from './frames.js';

/**
 * Streamed narration on the play screen (tasks 7.8, 7.9, 7.11): a sibling
 * to `move-flow.tsx` and `play-ui.tsx`, holding the one thing neither of
 * those owns — the passage arriving right now, and whether the Guide can be
 * reached.
 *
 * Requests run one at a time, in the order asked. A player can keep making
 * moves while a passage streams — mechanics never wait on the AI (§10) — so
 * a second beat's narration queues behind the first rather than
 * interleaving with it.
 *
 * A failure pauses play (D-116): `paused` is true until Retry succeeds, and
 * it is also true whenever the server reports the Guide unavailable (no
 * key configured, or a failure this client didn't see).
 */

export interface NarrationStream {
  readonly pending: PendingPassage | null;
  readonly failure: NarrationFailure | null;
  readonly paused: boolean;
  /** Why play is paused, in plain words. */
  readonly pauseReason: string | undefined;
  /** A request the server refused outright — not an outage, so it does not pause. */
  readonly notice: string | undefined;
  narrateAfter(afterCommandId: string): void;
  correct(targetEventId: string, note: string): void;
  retry(): void;
  dismissNotice(): void;
}

const NarrationStreamContext = createContext<NarrationStream | null>(null);

export function NarrationStreamProvider({
  campaignId,
  children,
}: {
  readonly campaignId: string;
  readonly children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const invalidateCampaign = useInvalidateCampaign(campaignId);
  const status = useAiStatus();

  const [pending, setPending] = useState<PendingPassage | null>(null);
  const [failure, setFailure] = useState<NarrationFailure | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const queue = useRef<NarrationTarget[]>([]);
  const running = useRef(false);

  const runOne = useCallback(
    async (target: NarrationTarget) => {
      let outcome: StreamOutcome = startPassage(target);
      setPending(outcome.kind === 'pending' ? outcome.passage : null);

      const commandId = crypto.randomUUID();
      const [path, body] =
        target.kind === 'beat'
          ? [narrateBeatPath(campaignId), { commandId, afterCommandId: target.afterCommandId }]
          : [
              correctNarrationPath(campaignId, target.targetEventId),
              { commandId, note: target.note },
            ];

      try {
        await streamNarration(path, body, (frame) => {
          outcome = applyFrame(outcome, frame);
          if (outcome.kind === 'pending') {
            setPending(outcome.passage);
          }
        });
        outcome = closeWithoutFrame(outcome);
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) {
          const problem = (error.body as { problem?: string; reason?: string } | undefined) ?? {};
          // A beat that already has its passage needs nothing more; anything
          // else refused is worth telling the player, but it is not an outage.
          if (problem.reason !== 'already_narrated') {
            setNotice(problem.problem ?? 'The Guide could not do that.');
          }
          outcome = { kind: 'committed', eventId: '' };
        } else {
          outcome = closeWithoutFrame(outcome);
        }
      }

      setPending(null);
      if (outcome.kind === 'failed') {
        setFailure(outcome.failure);
        // Anything still queued would fail the same way; Retry re-asks in order.
        queue.current = [];
      } else {
        setFailure(null);
      }
      invalidateCampaign();
      void queryClient.invalidateQueries({ queryKey: aiKeys.status });
      return outcome.kind !== 'failed';
    },
    [campaignId, invalidateCampaign, queryClient],
  );

  const drain = useCallback(async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    try {
      for (let next = queue.current.shift(); next !== undefined; next = queue.current.shift()) {
        if (!(await runOne(next))) {
          break;
        }
      }
    } finally {
      running.current = false;
    }
  }, [runOne]);

  const enqueue = useCallback(
    (target: NarrationTarget) => {
      queue.current.push(target);
      void drain();
    },
    [drain],
  );

  const serverUnavailable = status.data !== undefined && !status.data.available;
  const paused = failure !== null || serverUnavailable;
  const pauseReason =
    failure !== null
      ? describeFailure(failure.errorKind)
      : serverUnavailable && status.data?.lastFailure !== undefined
        ? describeFailure(status.data.lastFailure.errorKind)
        : undefined;

  const value = useMemo<NarrationStream>(
    () => ({
      pending,
      failure,
      paused,
      pauseReason,
      notice,
      narrateAfter: (afterCommandId) => enqueue({ kind: 'beat', afterCommandId }),
      correct: (targetEventId, note) => enqueue({ kind: 'revision', targetEventId, note }),
      retry: () => {
        if (failure !== null) {
          enqueue(failure.target);
        } else {
          void status.refetch();
        }
      },
      dismissNotice: () => setNotice(undefined),
    }),
    [pending, failure, paused, pauseReason, notice, enqueue, status],
  );

  return (
    <NarrationStreamContext.Provider value={value}>{children}</NarrationStreamContext.Provider>
  );
}

export function useNarrationStream(): NarrationStream {
  const stream = useContext(NarrationStreamContext);
  if (stream === null) {
    throw new Error('useNarrationStream must be used within a NarrationStreamProvider');
  }
  return stream;
}
