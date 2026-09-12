import type { CharacterId } from '@astrolabe/rules';

import { Meter } from '../../ui/Meter.js';
import { Signed } from '../../ui/Signed.js';

import type { CrewCardView } from './crew.js';
import styles from './CrewCard.module.css';

/**
 * D-42: callsign, health and momentum only — everything else (stats,
 * spirit, supply, impacts, assets, vows) opens in the drawer on click
 * (D-98). `isActing` is a placeholder for task 6.2's acting-character
 * control; nothing sets it yet.
 */
export function CrewCard({
  crew,
  isActing = false,
  onOpen,
}: {
  readonly crew: CrewCardView;
  readonly isActing?: boolean;
  readonly onOpen: (characterId: CharacterId) => void;
}) {
  return (
    <button
      type="button"
      className={styles.card}
      data-acting={isActing}
      onClick={() => onOpen(crew.characterId)}
    >
      <div className={styles.top}>
        <span className={styles.callsign}>{crew.callsign}</span>
        {isActing && <span className={styles.actingBadge}>Acting</span>}
      </div>
      <div className={styles.meters}>
        <Meter label="HP" value={crew.health.value} max={crew.health.max} />
        <span>
          <span className={styles.meterLabel}>Momentum</span>
          <Signed value={crew.momentum.value} />
        </span>
      </div>
    </button>
  );
}
