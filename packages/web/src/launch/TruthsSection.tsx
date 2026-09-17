import { useState } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useDecideTruth, useSaveLaunchDraft } from '../api/launch.js';
import { ErrorSummary } from '../ui/ErrorSummary.js';

import { launchErrorSummary } from './errors.js';
import {
  initialTruthsForm,
  toDraftSnapshot,
  unsavedTruths,
  type DecideTruthBody,
  type TruthSelection,
} from './truth-form.js';
import { buildTruths, truthProgress } from './truths.js';
import { TruthCard } from './TruthCard.js';
import { TruthProposalPanel } from './TruthProposalPanel.js';
import styles from './TruthsSection.module.css';

/**
 * Truths: the fourteen questions this campaign answers about its galaxy
 * (5.1, 5.2, beat 2).
 *
 * Each truth is accepted on its own, the moment the player chooses, rolls,
 * writes or leaves it open — so **Save and continue** is for the work in
 * between: a half-written answer, an option selected and not yet confirmed. It
 * is durable and it is not canon (D-161), which is what the note beside it
 * says.
 *
 * Status and blockers come from the server's readiness, verbatim (D-176). The
 * progress line counts what the server is not blocking, so the line and the
 * section's own chip cannot disagree.
 */
export function TruthsSection({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const [baseline] = useState(() => initialTruthsForm(workspace.state));
  const [form, setForm] = useState(baseline);
  const [saved, setSaved] = useState<string | undefined>(undefined);

  const saveDraft = useSaveLaunchDraft<'truths'>(campaignId);
  const decide = useDecideTruth(campaignId);
  const failure = decide.error ?? saveDraft.error;

  const views = buildTruths(workspace.state, workspace.chips, workspace.readiness.problems);
  const progress = truthProgress(views);
  const unsaved = unsavedTruths(form, baseline);

  const select = (truthId: string, selection: TruthSelection) => {
    setSaved(undefined);
    setForm((current) => ({ ...current, [truthId]: selection }));
  };

  const handleDecide = (body: DecideTruthBody) => {
    setSaved(undefined);
    decide.mutate(body);
  };

  return (
    <div className={styles.section}>
      {failure !== null && failure !== undefined && (
        <ErrorSummary takeFocus {...launchErrorSummary(failure)} />
      )}

      <p className={styles.progress} role="status">
        {progress.text}
      </p>

      <ol className={styles.list}>
        {views.map((view) => (
          <li key={view.truthId}>
            <TruthCard
              view={view}
              selection={form[view.truthId] ?? {}}
              onSelect={(selection) => select(view.truthId, selection)}
              onDecide={handleDecide}
              pending={decide.isPending}
            >
              <TruthProposalPanel
                campaignId={campaignId}
                view={view}
                workspace={workspace}
                selection={form[view.truthId] ?? {}}
                onSelect={(selection) => select(view.truthId, selection)}
                onDecide={handleDecide}
              />
            </TruthCard>
          </li>
        ))}
      </ol>

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
          onClick={() =>
            saveDraft.mutate(
              { section: 'truths', snapshot: toDraftSnapshot(form) },
              { onSuccess: () => setSaved('Saved as setup. This is not campaign canon yet.') },
            )
          }
        >
          Save and continue
        </button>
        {unsaved.length > 0 && (
          <p className={styles.note}>
            {unsaved.length === 1
              ? 'One truth has work you have not saved or accepted.'
              : `${unsaved.length} truths have work you have not saved or accepted.`}
          </p>
        )}
      </div>
      <p className={styles.note}>
        Saving keeps a part-written answer without making it a campaign fact. A truth becomes a fact
        when you use, roll or leave it open.
      </p>
    </div>
  );
}
