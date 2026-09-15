import type { TrackId } from '@astrolabe/rules';
import type { CampaignState } from '@astrolabe/shared';

/**
 * End a Session (task 9.4, D-149) as the composer shows it. Pure, like
 * `session.ts`.
 */

export interface SummaryDraft {
  readonly summary: string;
  readonly openThreads: readonly string[];
}

/** The threads the player is committing: trimmed, blanks dropped. */
export function committedThreads(draft: SummaryDraft): readonly string[] {
  return draft.openThreads.map((t) => t.trim()).filter((t) => t.length > 0);
}

/** Whether the player changed the Guide's words, which makes the record theirs. */
export function isEdited(draft: SummaryDraft, proposed: SummaryDraft): boolean {
  const threads = committedThreads(draft);
  return (
    draft.summary.trim() !== proposed.summary ||
    threads.length !== proposed.openThreads.length ||
    threads.some((t, i) => t !== proposed.openThreads[i])
  );
}

export function canCommit(draft: SummaryDraft): boolean {
  return draft.summary.trim().length > 0;
}

/**
 * Beat 10: "Reach a Milestone is available if you judge one was earned",
 * once for each vow still open. A reminder with no mechanism behind it in
 * Milestone 1 (D-149); the player marks progress by hand.
 */
export function milestoneReminders(
  state: Pick<CampaignState, 'tracks'>,
): readonly { readonly trackId: TrackId; readonly title: string }[] {
  return Object.values(state.tracks)
    .filter((t) => t.kind === 'vow' && t.ticks < t.maxTicks)
    .map((t) => ({ trackId: t.id, title: t.title }));
}
