import { describe, expect, it } from 'vitest';

import { fieldAnchorId, summaryEntries } from './error-summary.js';

describe('the error summary', () => {
  it('derives a link and its target from one path, so they cannot drift', () => {
    const [entry] = summaryEntries([{ path: 'premise', message: 'A campaign needs a premise.' }]);

    expect(entry).toEqual({
      id: 'launch-field-premise',
      message: 'A campaign needs a premise.',
      href: '#launch-field-premise',
    });
  });

  it('makes a fragment-safe id out of a nested path', () => {
    // Readiness paths are dotted, and `characters.abc-123.backgroundVow` is not
    // a legal fragment as it stands.
    expect(fieldAnchorId('characters.abc-123.backgroundVow')).toBe(
      'launch-field-characters-abc-123-backgroundVow',
    );
    expect(fieldAnchorId('sector.settlements')).toBe('launch-field-sector-settlements');
  });

  it('still yields an id for a path that is empty or all punctuation', () => {
    for (const path of ['', '...', '   ']) expect(fieldAnchorId(path)).toBe('launch-field-unknown');
  });

  it('keeps the server’s order and says nothing when there is nothing wrong', () => {
    const entries = summaryEntries([
      { path: 'b', message: 'Second' },
      { path: 'a', message: 'First' },
    ]);

    expect(entries.map((entry) => entry.message)).toEqual(['Second', 'First']);
    expect(summaryEntries([])).toEqual([]);
  });
});
