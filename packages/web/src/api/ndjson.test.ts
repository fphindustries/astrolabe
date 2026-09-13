import { describe, expect, it } from 'vitest';

import { FrameSplitter } from './ndjson.js';

describe('FrameSplitter (D-111)', () => {
  it('holds a partial line until the rest of it arrives', () => {
    const splitter = new FrameSplitter();
    expect(splitter.push('{"type":"delta","te')).toEqual([]);
    expect(splitter.push('xt":"Sparks"}\n{"type":"delta","text":" fly"}\n')).toEqual([
      { type: 'delta', text: 'Sparks' },
      { type: 'delta', text: ' fly' },
    ]);
  });

  it('flushes a last line with no trailing newline', () => {
    const splitter = new FrameSplitter();
    splitter.push('{"type":"committed","eventId":"e1"}');
    expect(splitter.flush()).toEqual([{ type: 'committed', eventId: 'e1' }]);
    expect(splitter.flush()).toEqual([]);
  });
});
