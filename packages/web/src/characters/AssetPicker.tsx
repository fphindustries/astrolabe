import type { AssetId, CreationSlot, RulesetForCreation } from '@astrolabe/rules';

import { slotOptionGroups } from './creation-form.js';
import styles from './AssetPicker.module.css';

const NONE = '';

/**
 * One creation slot's picker (task 3.4): a select grouped by the categories
 * the slot allows (D-89). A path's `requirement` gates *use*, not
 * selection (D-91) — it is shown as a note under the select and never
 * disables an option.
 */
export function AssetPicker({
  slot,
  ruleset,
  selected,
  onChange,
}: {
  readonly slot: CreationSlot;
  readonly ruleset: Pick<RulesetForCreation, 'assets' | 'assetCategories'>;
  readonly selected: AssetId | undefined;
  readonly onChange: (assetId: AssetId | undefined) => void;
}) {
  const groups = slotOptionGroups(slot, ruleset);
  const selectedAsset = ruleset.assets.find((asset) => asset.id === selected);

  return (
    <div className={styles.slot}>
      <label className={styles.label} htmlFor={`slot-${slot.id}`}>
        {slot.label}
      </label>
      <select
        id={`slot-${slot.id}`}
        className={styles.select}
        value={selected ?? NONE}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === NONE ? undefined : (value as AssetId));
        }}
      >
        <option value={NONE}>— none —</option>
        {groups.map((group) => (
          <optgroup key={group.category.id} label={group.category.name}>
            {group.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selectedAsset?.requirement !== undefined && (
        <p className={styles.requirement}>{selectedAsset.requirement}</p>
      )}
    </div>
  );
}
