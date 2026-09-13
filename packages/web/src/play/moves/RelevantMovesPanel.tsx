import { STARFORGED, type MoveId } from '@astrolabe/rules';

import { relevantMoveItems } from './relevant-moves.js';
import styles from './RelevantMovesPanel.module.css';

/**
 * Task 6.1: the moves that fit the current situation, highlighted in the
 * composer. Milestone 1's relevance is category-only (D-66), so this is the
 * same list every time — "the full list one click away" reuses the moves
 * browser `MoveDrawer` (D-104) already built rather than a second one.
 */
export function RelevantMovesPanel({
  onSelect,
  onOpenFullList,
}: {
  readonly onSelect: (moveId: MoveId) => void;
  readonly onOpenFullList: () => void;
}) {
  const items = relevantMoveItems(STARFORGED.moves);

  return (
    <div className={styles.panel}>
      <div className={styles.list}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.moveButton}
            onClick={() => onSelect(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <button type="button" className={styles.fullList} onClick={onOpenFullList}>
        All moves…
      </button>
    </div>
  );
}
