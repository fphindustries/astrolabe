import { STARFORGED, withoutLinks, type AssetId } from '@astrolabe/rules';

import { Drawer } from '../../ui/Drawer.js';

import styles from './AssetDrawer.module.css';

/**
 * Task 5.7's asset drawer: full name/category/text/abilities from
 * `STARFORGED`, opened from the asset chip in `CharacterDrawer`.
 */
export function AssetDrawer({
  assetId,
  onClose,
}: {
  readonly assetId: AssetId;
  readonly onClose: () => void;
}) {
  const asset = STARFORGED.assets.find((candidate) => candidate.id === assetId);

  return (
    <Drawer open onClose={onClose} title={asset?.name ?? 'Asset'} side="right">
      {asset === undefined ? (
        <p className={styles.empty}>Unknown asset.</p>
      ) : (
        <>
          <p className={styles.category}>{asset.category}</p>
          {asset.requirement !== undefined && (
            <p className={styles.requirement}>{withoutLinks(asset.requirement)}</p>
          )}
          <ul className={styles.list}>
            {asset.abilities.map((ability) => (
              <li key={ability.id} className={styles.ability}>
                {withoutLinks(ability.text)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
}
