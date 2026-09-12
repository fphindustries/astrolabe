import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'packages/rules/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The rules package is pure: no I/O, no ambient randomness. Dice take an
    // injected RNG so the golden session is deterministic (task 1.4, 10.4).
    files: ['packages/rules/src/**/*.ts'],
    ignores: ['packages/rules/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'The rules package is pure: no I/O.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Dice take an injected RNG so tests and the golden session are deterministic.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'The rules package is pure: no I/O.',
            },
          ],
        },
      ],
    },
  },
  {
    // Projection is a pure fold over the log: no RNG, no clock, no I/O, and
    // no reads of versioned rules content (docs/design-event-log.md section 2).
    //
    // The content ban is the subtle one. Pure *functions* from  are
    // fine — applyMomentumDelta, momentumMax — but STARFORGED is versioned
    // *data*, and reading it during projection would let a Datasworn
    // regeneration change what an old campaign's numbers were. Which effects
    // an outcome produces is resolved once, at write time, and stored.
    files: ['packages/server/src/projection/**/*.ts'],
    ignores: ['packages/server/src/projection/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Projection is pure: no I/O.' },
        { name: 'crypto', message: 'Projection is pure: ids are minted at write time.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Projection is deterministic: dice are rolled once, at write time.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Projection is deterministic: occurredAt is stored on the event.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'postgres',
              message: 'Projection does no I/O. The store (db/) is the only module that does.',
            },
            {
              name: '@anthropic-ai/sdk',
              message: 'Projection never calls a provider. AI output is an event like any other.',
            },
          ],
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'Projection is pure: no I/O.',
            },
            {
              group: ['**/db/**'],
              message: 'Projection does no I/O. The store (db/) is the only module that does.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportSpecifier[imported.name='STARFORGED']",
          message:
            'Projection may call pure functions from rules, but never read versioned rules content. ' +
            'Anything content-derived is resolved at write time and stored on the event.',
        },
        {
          selector: "ImportSpecifier[imported.name='ATTRIBUTION']",
          message: 'Projection may call pure functions from rules, but never read rules content.',
        },
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'Projection is deterministic: occurredAt is stored on the event.',
        },
      ],
    },
  },
);
