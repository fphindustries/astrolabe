import styles from './TopBar.module.css';

/**
 * §8's top bar: campaign, location, scene state, connection status.
 *
 * Location and scene state bind in with the scene header (5.3) — the top
 * bar itself only needs what identifies the session at a glance.
 * "Connection status" means API reachability in Milestone 1 (D-99): there
 * is no realtime channel yet, so `connected` reflects whether the state
 * query is succeeding, not a socket. AI-provider availability gets its own
 * indicator in task 7.11 (D-53).
 *
 * `onOpenMoves` is task 5.7's seed entry point for the moves reference
 * browser (D-104) — task 6.1's relevant-moves panel reuses it rather than
 * building a second one.
 */
export function TopBar({
  campaignName,
  sessionNumber,
  connected,
  onOpenMoves,
}: {
  readonly campaignName: string;
  readonly sessionNumber: number | undefined;
  readonly connected: boolean;
  readonly onOpenMoves: () => void;
}) {
  return (
    <div className={styles.bar}>
      <span className={styles.campaign}>{campaignName}</span>
      {sessionNumber !== undefined && (
        <span className={styles.session}>Session {sessionNumber}</span>
      )}
      <button type="button" className={styles.movesButton} onClick={onOpenMoves}>
        Moves
      </button>
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
