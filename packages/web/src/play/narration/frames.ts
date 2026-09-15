import type { AiErrorKind, NarrationFrame } from '@astrolabe/shared';

/**
 * Pure pieces of streamed narration (task 7.8, D-111), kept out of the
 * React context so they are tested without a DOM — the same split as
 * `crew/crew.ts`.
 */

/** What a streaming request is for, and so how to retry it. */
export type NarrationTarget =
  | { readonly kind: 'beat'; readonly afterCommandId: string }
  | { readonly kind: 'revision'; readonly targetEventId: string; readonly note: string }
  /** D-138 (amended): the world pass that follows a beat's committed passage, and its own passage. */
  | { readonly kind: 'world'; readonly passageEventId: string }
  /** D-141: the open scene's framing passage. */
  | { readonly kind: 'scene_frame' }
  /** D-147: the recap that opens a session. */
  | { readonly kind: 'recap' };

/** A passage struck while it streamed (D-128): never quietly replaced. */
export interface WithdrawnPassage {
  readonly reason: string;
  readonly text: string;
}

export interface PendingPassage {
  readonly target: NarrationTarget;
  /** Provisional until committed: it is shown while written, and checked before it is kept (D-128). */
  readonly text: string;
  /**
   * `waiting` until the first text arrives; `checking` once it has all
   * arrived; `retrying` after a reset or a withdrawal.
   */
  readonly status: 'waiting' | 'streaming' | 'checking' | 'retrying';
  /** Attempts withdrawn so far, in order, each with its reason. */
  readonly withdrawn: readonly WithdrawnPassage[];
}

export interface NarrationFailure {
  readonly target: NarrationTarget;
  readonly errorKind: AiErrorKind;
  readonly message: string;
}

export type StreamOutcome =
  | { readonly kind: 'pending'; readonly passage: PendingPassage }
  | { readonly kind: 'committed'; readonly eventId: string }
  | { readonly kind: 'failed'; readonly failure: NarrationFailure };

export function startPassage(target: NarrationTarget): StreamOutcome {
  return { kind: 'pending', passage: { target, text: '', status: 'waiting', withdrawn: [] } };
}

/** Fold one frame into the in-flight passage. A finished stream ignores anything after its last frame. */
export function applyFrame(outcome: StreamOutcome, frame: NarrationFrame): StreamOutcome {
  if (outcome.kind !== 'pending') {
    return outcome;
  }
  const { passage } = outcome;
  switch (frame.type) {
    case 'world':
      // Nothing to show in the passage itself; the stream owner refetches state.
      return outcome;
    case 'delta':
      return {
        kind: 'pending',
        passage: { ...passage, text: passage.text + frame.text, status: 'streaming' },
      };
    case 'reset':
      return { kind: 'pending', passage: { ...passage, text: '', status: 'retrying' } };
    case 'checking':
      return { kind: 'pending', passage: { ...passage, status: 'checking' } };
    case 'withdrawn':
      return {
        kind: 'pending',
        passage: {
          ...passage,
          text: '',
          status: 'retrying',
          withdrawn: [...passage.withdrawn, { reason: frame.reason, text: frame.rejectedText }],
        },
      };
    case 'committed':
      return { kind: 'committed', eventId: frame.eventId };
    case 'failed':
      return {
        kind: 'failed',
        failure: { target: passage.target, errorKind: frame.errorKind, message: frame.message },
      };
  }
}

/**
 * What a finished request leads to. A beat's committed passage is followed
 * by its world pass (D-138, amended); nothing else is. A refused request
 * commits no passage, so it leads nowhere.
 */
export function followUp(
  target: NarrationTarget,
  outcome: StreamOutcome,
): NarrationTarget | undefined {
  return target.kind === 'beat' && outcome.kind === 'committed' && outcome.eventId !== ''
    ? { kind: 'world', passageEventId: outcome.eventId }
    : undefined;
}

/** A stream that closed without a closing frame lost its connection, not its answer. */
export function closeWithoutFrame(outcome: StreamOutcome): StreamOutcome {
  return outcome.kind === 'pending'
    ? {
        kind: 'failed',
        failure: {
          target: outcome.passage.target,
          errorKind: 'unavailable',
          message: 'The connection closed before the Guide finished.',
        },
      }
    : outcome;
}

/** The plain-language line the paused banner shows (D-116). */
export function describeFailure(errorKind: AiErrorKind): string {
  switch (errorKind) {
    case 'not_configured':
      return 'The Guide is not configured on the server.';
    case 'auth':
      return 'The server’s AI credentials were rejected.';
    case 'rate_limited':
      return 'The AI provider is rate-limiting requests.';
    case 'refused':
      return 'The AI provider declined that request.';
    case 'invalid_output':
      return 'The Guide’s answer could not be used.';
    case 'unavailable':
      return 'The AI provider could not be reached.';
    case 'rejected':
      return 'The AI provider rejected the request — check the server log and configuration.';
  }
}
