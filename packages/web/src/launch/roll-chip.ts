import { withoutLinks } from '@astrolabe/rules';
import type { OracleChip } from '@astrolabe/shared';

/**
 * One roll behind a proposed field, as its chip reads: the table, the roll
 * and the row (A41). A row can link to another table in Datasworn's markdown
 * — `[Ocean World](id:oracle:planets/ocean)` — and the chip shows the words,
 * not the link (10.4, found in the browser pass).
 */
export function rollChipText(chip: Pick<OracleChip, 'oracleId' | 'roll' | 'rowText'>): string {
  return `${chip.oracleId.split('/').at(-1) ?? chip.oracleId} ${String(chip.roll)}: ${withoutLinks(chip.rowText)}`;
}
