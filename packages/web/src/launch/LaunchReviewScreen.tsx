import { useState } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useActivateLaunch } from '../api/launch.js';
import { navigate } from '../app/location.js';
import { Link } from '../app/routes.js';
import { ErrorSummary } from '../ui/ErrorSummary.js';

import { launchErrorSummary } from './errors.js';
import { LaunchConfirmDialog } from './LaunchConfirmDialog.js';
import { buildReview } from './review.js';
import { launchOverviewPath } from './sections.js';
import styles from './LaunchReviewScreen.module.css';

/**
 * Review and launch (task 4.3).
 *
 * Group 4 builds the shell: what is accepted, what still blocks, and the
 * irreversible confirmation. It does not choose who swears the vow, who shares
 * it, at what rank, or which scene opens — `POST /launch/activate` takes a
 * `commandId` and nothing else, because all four are already part of the
 * accepted incident. Group 9's incident screen owns those; here they are shown
 * read-only, or their absence is stated.
 */
export function LaunchReviewScreen({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const [confirming, setConfirming] = useState(false);
  const review = buildReview(campaignId, workspace);
  const activate = useActivateLaunch(campaignId);
  const { summary } = review;

  const handleConfirm = (commandId: string) => {
    activate.mutate(commandId, {
      onSuccess: () => {
        setConfirming(false);
        // The dispatcher re-reads, sees launch is closed, and opens play on the
        // new scene. One decision point, so there is no second opinion here
        // about where an activated campaign belongs.
        navigate(`/campaigns/${campaignId}`);
      },
      onError: () => setConfirming(false),
    });
  };

  return (
    <section className={styles.review}>
      <Link className={styles.back} href={launchOverviewPath(campaignId)}>
        ← All sections
      </Link>
      <h2 className={styles.heading}>Review and launch</h2>

      {activate.error !== null && (
        <ErrorSummary takeFocus {...launchErrorSummary(activate.error)} />
      )}

      {review.launchEnabled ? (
        <p className={styles.ready} role="status">
          Everything Campaign Launch needs is in place.
        </p>
      ) : (
        <div className={styles.blocked}>
          <h3 className={styles.blockedHeading} id="launch-blocked">
            This campaign isn’t ready to launch — {review.problemCount}{' '}
            {review.problemCount === 1 ? 'problem' : 'problems'} across {review.groups.length}{' '}
            {review.groups.length === 1 ? 'section' : 'sections'}.
          </h3>
          {review.groups.map((group) => (
            <div key={group.section} className={styles.group}>
              <Link className={styles.groupName} href={group.href}>
                {group.label}
              </Link>
              <ul className={styles.problems}>
                {group.problems.map((problem) => (
                  <li key={`${problem.code}:${problem.path}`}>{problem.message}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <dl className={styles.summary}>
        <Fact label="Campaign" value={summary.campaignName} />
        <Fact label="Premise" value={summary.premise} />
        <Fact label="Truths decided" value={`${summary.truthsDecided} of 14`} />
        <Fact label="Crew" value={summary.crew.length > 0 ? summary.crew.join(', ') : null} />
        <Fact label="Starship" value={summary.starshipName} />
        <Fact label="Starts at" value={summary.startingSettlementName} />
        <Fact label="Sector trouble" value={summary.sectorTrouble} />
        <Fact
          label="Connection"
          value={
            summary.connection ? `${summary.connection.npcName} — ${summary.connection.role}` : null
          }
        />
        <Fact label="Inciting incident" value={summary.incident?.text ?? null} />
        {summary.incident !== null && (
          <>
            <Fact
              label="Sworn by"
              value={
                summary.incident.rollerName === null || summary.incident.participantNames === null
                  ? null
                  : `${summary.incident.rollerName} (${summary.incident.rank}), shared with ${summary.incident.participantNames.join(', ')}`
              }
            />
            <Fact label="Opening scene" value={summary.incident.openingScene} />
          </>
        )}
      </dl>

      <div className={styles.actions}>
        {/* `aria-disabled` rather than `disabled`, so the control stays in the
            tab order and a keyboard user reaches the reason it names. A
            `disabled` button is skipped entirely, which would have made the
            `aria-describedby` below reach nobody. The click is guarded instead. */}
        <button
          type="button"
          className={styles.primary}
          aria-disabled={!review.launchEnabled || activate.isPending}
          aria-describedby={review.launchEnabled ? undefined : 'launch-blocked'}
          onClick={() => {
            if (review.launchEnabled && !activate.isPending) setConfirming(true);
          }}
        >
          Launch campaign
        </button>
        {!review.launchEnabled && (
          <p className={styles.why}>
            Launching stays unavailable until the problems above are settled.
          </p>
        )}
      </div>

      {confirming && (
        <LaunchConfirmDialog
          campaignName={summary.campaignName}
          pending={activate.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={handleConfirm}
        />
      )}
    </section>
  );
}

/** A launch fact, or a plain statement that it is not settled yet. */
function Fact({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={value === null ? styles.factMissing : styles.factValue}>
        {value ?? 'Not settled yet'}
      </dd>
    </div>
  );
}
