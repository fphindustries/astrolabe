import { useState } from 'react';

import type { EntityId } from '@astrolabe/shared';

import { ApiError } from '../../api/http.js';
import { useBeginSession } from '../../api/narration.js';
import { useNarrationStream } from '../narration/narration-stream.js';

import type { SessionView } from './session.js';
import styles from './BeginSession.module.css';

/**
 * Begin a Session (9.1, D-146), standing in for the composer while no
 * session is open. It commits at once, and the recap streams after it
 * (D-147), so beginning never waits on the Guide.
 */
export function BeginSession({
  campaignId,
  view,
}: {
  readonly campaignId: string;
  readonly view: Exclude<SessionView, { kind: 'open' }>;
}) {
  const begin = useBeginSession(campaignId);
  const narration = useNarrationStream();
  const [title, setTitle] = useState('');
  const [locationId, setLocationId] = useState('');

  const start = () => {
    begin.mutate(
      view.kind === 'first'
        ? {
            scene: {
              title: title.trim(),
              ...(locationId !== '' ? { locationId: locationId as EntityId } : {}),
            },
          }
        : {},
      {
        onSuccess: (response) => {
          if (response.recap) {
            narration.recap();
          }
        },
      },
    );
  };

  const problem =
    begin.error instanceof ApiError
      ? ((begin.error.body as { problem?: string } | undefined)?.problem ??
        'The session could not begin.')
      : begin.error !== null
        ? 'The session could not begin.'
        : undefined;

  return (
    <div className={styles.begin}>
      {view.kind === 'first' ? (
        <>
          <span className={styles.title}>Begin the first session</span>
          <label className={styles.field}>
            <span className={styles.label}>Opening scene</span>
            <input
              className={styles.input}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Where does the story open?"
            />
          </label>
          {view.locations.length > 0 && (
            <label className={styles.field}>
              <span className={styles.label}>Location</span>
              <select
                className={styles.input}
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">None</option>
                {view.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <span className={styles.title}>
          Session {view.number}
          {view.sceneTitle !== undefined && (
            <span className={styles.scene}>
              {' '}
              opens on {view.sceneTitle}
              {view.locationName !== undefined ? `, at ${view.locationName}` : ''}
            </span>
          )}
        </span>
      )}
      <button
        type="button"
        className={styles.start}
        disabled={begin.isPending || (view.kind === 'first' && title.trim().length === 0)}
        onClick={start}
      >
        {begin.isPending ? 'Beginning…' : 'Begin session'}
      </button>
      {problem !== undefined && (
        <span className={styles.problem} role="alert">
          {problem}
        </span>
      )}
    </div>
  );
}
