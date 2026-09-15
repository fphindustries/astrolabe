import { MOMENTUM_MIN, type CharacterId } from '@astrolabe/rules';

import { Meter } from '../../ui/Meter.js';
import { MomentumScale } from '../../ui/MomentumScale.js';

import type { CrewCardView } from './crew.js';
import styles from './CrewCard.module.css';

/**
 * D-42: callsign, health and momentum only — everything else (stats,
 * spirit, supply, impacts, assets, vows) opens in the drawer on click
 * (D-98). The acting character, chosen in the composer, is marked in words.
 * Health is pips and momentum its scale (10.2), both inside D-97's 56px.
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
      <span className={styles.top}>
        <span className={styles.callsign}>{crew.callsign}</span>
        {isActing && <span className={styles.actingBadge}>Acting</span>}
      </span>
      <span className={styles.meters}>
        <Meter label="HP" value={crew.health.value} max={crew.health.max} showValue={false} />
        <MomentumScale
          value={crew.momentum.value}
          min={MOMENTUM_MIN}
          max={crew.momentum.max}
          compact
        />
      </span>
    </button>
  );
}
