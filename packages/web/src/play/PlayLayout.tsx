import { useRef, type ReactNode } from 'react';

import { useFocusHandoff } from '../ui/focus.js';

import styles from './PlayLayout.module.css';

/**
 * The play screen's shell (task 5.1). Pure layout: it takes the five zones
 * as props and knows nothing about campaign data, so 5.3–5.7 and group 6
 * bind real content into it without touching this file.
 *
 * Each zone is a landmark for keyboard and screen-reader navigation; the
 * log carries `role="log"` since it's the one region that streams new
 * content in.
 */
export function PlayLayout({
  top,
  left,
  sceneHeader,
  log,
  right,
  composer,
}: {
  readonly top: ReactNode;
  readonly left: ReactNode;
  readonly sceneHeader: ReactNode;
  readonly log: ReactNode;
  readonly right: ReactNode;
  readonly composer: ReactNode;
}) {
  // 10.3: a move-flow step replacing the one a keyboard player was on keeps focus in the composer.
  const composerRef = useRef<HTMLElement>(null);
  useFocusHandoff(composerRef);

  return (
    <div className={styles.shell}>
      <header className={styles.top}>{top}</header>
      <aside className={styles.left} aria-label="Crew">
        {left}
      </aside>
      <main className={styles.centre}>
        {sceneHeader}
        <div className={styles.log} role="log">
          {log}
        </div>
      </main>
      <aside className={styles.right} aria-label="Pressure">
        {right}
      </aside>
      <section ref={composerRef} className={styles.composer} aria-label="Action composer">
        {composer}
      </section>
    </div>
  );
}
