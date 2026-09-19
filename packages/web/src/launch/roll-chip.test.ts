import { describe, expect, it } from 'vitest';

import { rollChipText } from './roll-chip.js';

describe('a roll chip (A41)', () => {
  it('names the table and the roll, and shows a linked row as its words (10.4)', () => {
    expect(
      rollChipText({
        oracleId: 'oracle:planets/class',
        roll: 74,
        rowText: '[Ocean World](id:oracle:planets/ocean)',
      }),
    ).toBe('class 74: Ocean World');
  });
});
