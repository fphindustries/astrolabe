import type { AssetId } from '@astrolabe/rules';

import type { ShipView } from './ship-view.js';
import styles from './ShipCard.module.css';

/**
 * The crew's ship in play: once, at crew level, never under each character
 * (7.2, D-164, D-192). One card within D-97's 56px rail budget. Each asset
 * opens the ordinary asset drawer, where its abilities are Reference.
 */
export function ShipCard({
  view,
  onOpenAsset,
}: {
  readonly view: ShipView;
  readonly onOpenAsset: (assetId: AssetId) => void;
}) {
  return (
    <section className={styles.card} aria-label={`The crew’s ship, ${view.name ?? 'unnamed'}`}>
      <div className={styles.top}>
        <span className={styles.name}>{view.name ?? 'The crew’s ship'}</span>
        <span className={styles.integrity}>
          Integrity {view.integrity.value}/{view.integrity.max}
        </span>
      </div>
      <div className={styles.assets}>
        <button
          type="button"
          className={styles.chip}
          onClick={() => onOpenAsset(view.asset.assetId)}
        >
          {view.asset.name}
        </button>
        {view.modules.map((module) => (
          <button
            key={module.assetId}
            type="button"
            className={styles.chip}
            aria-label={`${module.name}, ${module.ownerName}’s module`}
            onClick={() => onOpenAsset(module.assetId)}
          >
            {module.name} · {module.ownerName.split(' ')[0]}
          </button>
        ))}
      </div>
    </section>
  );
}
