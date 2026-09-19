import type { SectionCardView } from './dashboard.js';
import styles from './SectionPlaceholder.module.css';

/**
 * A section whose editor is still ahead (groups 5–9).
 *
 * Two things this deliberately does not do. It shows **no disabled inputs and
 * no greyed mock form**: nothing that implies a form exists here. And it
 * reports the server's status as it stands, including `Complete` — someone may
 * have driven the API directly, or a legacy campaign may already carry the
 * facts, and the status is about the campaign rather than about whether group 4
 * built this screen.
 */
export function SectionPlaceholder({ card }: { readonly card: SectionCardView }) {
  return (
    <div className={styles.placeholder}>
      <p className={styles.pending}>
        This section isn’t built yet. It arrives with {card.arrivesIn}.
      </p>
      <h2 className={styles.heading}>What’s still needed</h2>
      {card.blockers.length === 0 ? (
        <p className={styles.none}>The server reports nothing blocking here.</p>
      ) : (
        <ul className={styles.blockers}>
          {card.blockers.map((blocker) => (
            <li key={`${blocker.code}:${blocker.path}`}>{blocker.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
