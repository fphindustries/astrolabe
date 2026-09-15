import { describe, expect, it } from 'vitest';

import { isSubmitChord } from './keys.js';

describe('keyboard submit (10.3)', () => {
  it('sends on Ctrl+Enter or ⌘+Enter, and a plain Enter still makes a new line', () => {
    expect(isSubmitChord({ key: 'Enter', ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSubmitChord({ key: 'Enter', ctrlKey: false, metaKey: true })).toBe(true);
    expect(isSubmitChord({ key: 'Enter', ctrlKey: false, metaKey: false })).toBe(false);
    expect(isSubmitChord({ key: 'a', ctrlKey: true, metaKey: false })).toBe(false);
  });
});
