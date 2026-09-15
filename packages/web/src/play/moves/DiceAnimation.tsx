import { useEffect, useState, type ReactNode } from 'react';

import styles from './DiceAnimation.module.css';

const ROLL_DURATION_MS = 600;

/**
 * Task 6.4: animated, skippable dice. Presentation only, over an
 * already-resolved roll — the server settles the numbers before this ever
 * renders (§10/A18: dice never wait on anything, and nothing here waits on
 * dice either). Skipping just short-circuits the animation; it never
 * re-rolls or requests a different result.
 */
export function DiceAnimation({ children }: { readonly children: ReactNode }) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), ROLL_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (settled) {
    return <>{children}</>;
  }

  return (
    <button
      type="button"
      className={styles.rolling}
      // 10.3: focus waits on the skip control, then moves on to the result once it settles.
      data-focus-target
      onClick={() => setSettled(true)}
      aria-label="Skip dice animation"
    >
      <span className={styles.die} />
      <span className={styles.die} />
      Rolling…
    </button>
  );
}
