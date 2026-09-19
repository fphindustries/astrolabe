import { useRef } from 'react';

import type { TokenUsage } from '@astrolabe/shared';

import { useFocusOnArrival } from '../ui/focus.js';

import { tokenCounter } from './tokens.js';
import styles from './TopBar.module.css';

/**
 * §8's top bar: campaign, location, scene state, connection status.
 *
 * Location and scene state bind in with the scene header (5.3) — the top
 * bar itself only needs what identifies the session at a glance.
 * "Connection status" means API reachability in Milestone 1 (D-99): there
 * is no realtime channel yet, so `connected` reflects whether the state
 * query is succeeding, not a socket. The Guide's availability is its own
 * indicator (task 7.11, D-53, D-116), beside the session's token counter
 * (task 7.10, D-51) — a projection over `ai.completed` and `ai.failed`, so
 * it survives a reload (D-75).
 *
 * `onOpenMoves` is task 5.7's seed entry point for the moves reference
 * browser (D-104) — task 6.1's relevant-moves panel reuses it rather than
 * building a second one.
 */
export function TopBar({
  campaignName,
  sessionNumber,
  connected,
  guideAvailable,
  tokens,
  campaignTokens,
  onOpenMoves,
}: {
  readonly campaignName: string;
  readonly sessionNumber: number | undefined;
  readonly connected: boolean;
  /** `undefined` while the status is still loading. */
  readonly guideAvailable: boolean | undefined;
  readonly tokens: TokenUsage | undefined;
  /** D-125: every call the campaign paid for, sessions or not. */
  readonly campaignTokens: TokenUsage | undefined;
  readonly onOpenMoves: () => void;
}) {
  const counter = tokenCounter(tokens, campaignTokens);
  // The play screen's heading, so a screen reached by navigation, activation
  // included, has somewhere to take focus (D-209).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnArrival(headingRef);
  return (
    <div className={styles.bar}>
      <h1 className={styles.campaign} ref={headingRef}>
        {campaignName}
      </h1>
      {sessionNumber !== undefined && (
        <span className={styles.session}>Session {sessionNumber}</span>
      )}
      <button type="button" className={styles.movesButton} onClick={onOpenMoves}>
        Moves
      </button>
      <span className={styles.spacer} />
      {counter !== undefined && (
        <span className={styles.tokens} title={counter.title}>
          {counter.label}
        </span>
      )}
      <span className={styles.status}>
        <span
          className={styles.dot}
          data-status={guideAvailable === false ? 'disconnected' : 'connected'}
          aria-hidden="true"
        />
        {guideAvailable === undefined
          ? 'Guide…'
          : guideAvailable
            ? 'Guide ready'
            : 'Guide unavailable'}
      </span>
      <span className={styles.status}>
        <span
          className={styles.dot}
          data-status={connected ? 'connected' : 'disconnected'}
          aria-hidden="true"
        />
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}
