import { describe, expect, it } from 'vitest';

import { RULES_PACKAGE } from '@astrolabe/rules';
import { SHARED_PACKAGE } from '@astrolabe/shared';

import { SERVER_PACKAGE } from './index.js';

/**
 * Task 1.1's only real assertion: the workspace graph resolves. The server
 * can see `rules` and `shared`, which is what every later task depends on.
 */
describe('monorepo scaffold', () => {
  it('resolves the workspace packages the server depends on', () => {
    expect(SERVER_PACKAGE).toBe('@astrolabe/server');
    expect(RULES_PACKAGE).toBe('@astrolabe/rules');
    expect(SHARED_PACKAGE).toBe('@astrolabe/shared');
  });
});
