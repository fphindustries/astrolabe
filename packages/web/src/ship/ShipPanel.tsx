import { useId, useState } from 'react';

import type { AbilityView, ShipAssetView, ShipView } from './ship-view.js';
import styles from './ShipPanel.module.css';

/**
 * The shared Starship asset and its installed modules, on the Starship step
 * (7.2, beat 6, A30).
 *
 * The page shows one command vehicle, not one per character, and each module
 * under the name of the character who chose it (D-190). Abilities are shown as
 * Reference, with which are on from the start; nothing here offers them to a
 * move (D-192).
 */
export function ShipPanel({ view }: { readonly view: ShipView }) {
  return (
    <section className={styles.panel} aria-labelledby="ship-panel-heading">
      <div className={styles.head}>
        <h3 className={styles.heading} id="ship-panel-heading">
          {view.name ?? 'The crew’s ship'}
        </h3>
        <p className={styles.integrity}>
          Integrity {view.integrity.value} of {view.integrity.max}
        </p>
      </div>

      <AssetBlock asset={view.asset} tag="Shared by the whole crew" />

      <h4 className={styles.subheading}>Installed modules</h4>
      {view.modules.length === 0 ? (
        <p className={styles.empty}>
          None yet. A module a character takes as their final asset is installed here, under their
          name.
        </p>
      ) : (
        view.modules.map((module) => (
          <AssetBlock
            key={module.assetId}
            asset={module}
            tag={`${module.ownerName}’s module · usable by the crew`}
          />
        ))
      )}
    </section>
  );
}

/**
 * TruthCard's disclosure pattern — a button with `aria-expanded` and a list
 * that is `hidden` until opened — so every disclosure in the launch reads the
 * same way to a screen reader and a keyboard.
 */
function AssetBlock({ asset, tag }: { readonly asset: ShipAssetView; readonly tag: string }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className={styles.asset}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.assetName}>{asset.name}</span>
        <span className={styles.tag}>{tag}</span>
      </button>
      <ul className={styles.abilities} id={listId} hidden={!open}>
        {asset.abilities.map((ability, index) => (
          <Ability key={index} ability={ability} />
        ))}
      </ul>
    </div>
  );
}

function Ability({ ability }: { readonly ability: AbilityView }) {
  return (
    <li className={styles.ability}>
      <span className={styles.abilityState}>
        {ability.enabled ? 'On from the start' : 'Upgrade'}
      </span>
      {ability.text}
    </li>
  );
}
