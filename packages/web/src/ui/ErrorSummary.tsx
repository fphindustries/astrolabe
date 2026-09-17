import { useEffect, useRef } from 'react';

import { summaryEntries } from './error-summary.js';
import styles from './ErrorSummary.module.css';

/**
 * The accessible error summary (task 4.2).
 *
 * The pattern: one `role="alert"` region naming how many problems there are,
 * then a link per problem that moves focus to the field it is about. It takes
 * focus itself when it appears, so a keyboard or screen-reader user submitting
 * a form lands on the explanation rather than being left where they were with
 * something changed off-screen.
 *
 * `fieldAnchorId` in `error-summary.ts` makes both the link and its target from
 * the same path, so a field can't quietly stop being reachable from its own
 * error.
 */
export function ErrorSummary({
  title,
  problems = [],
  details = [],
  takeFocus = false,
}: {
  readonly title: string;
  readonly problems?: readonly { readonly path: string; readonly message: string }[];
  readonly details?: readonly string[];
  /** Set after a failed submit; not on a summary that was simply on the page. */
  readonly takeFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = summaryEntries(problems);

  useEffect(() => {
    if (takeFocus) ref.current?.focus();
  }, [takeFocus, title]);

  return (
    <div ref={ref} role="alert" tabIndex={-1} className={styles.summary}>
      <p className={styles.title}>{title}</p>
      {details.length > 0 && (
        <ul className={styles.details}>
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      {entries.length > 0 && (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <a className={styles.link} href={entry.href}>
                {entry.message}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
